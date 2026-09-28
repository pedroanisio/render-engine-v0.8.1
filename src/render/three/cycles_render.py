"""Cycles CPU adapter. Scene units are pixels; 100 pixels equal one metre."""
import json, math, sys, os
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector, Euler, Matrix
request=json.loads(Path(sys.argv[1]).read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=(16 if request.get('quality')=='draft' else 48)*int(request.get('antialias',1))
scene.cycles.seed=request['seed']
scene.cycles.use_animated_seed=False
scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED'; scene.render.threads=1
scene.render.resolution_x=request['width'];scene.render.resolution_y=request['height'];scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='OPEN_EXR';scene.render.image_settings.color_depth='32';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
U=0.01
scene.render.fps=max(1,round(float(request.get('fps',24))))

def vec(a): return Vector((float(a.get('x',0))*U,-float(a.get('y',0))*U,-float(a.get('z',a.get('zDepth',0)))*U))
def rotation(a,camera=False): return Euler((math.radians(float(a.get('pitch' if camera else 'rotationX',0))),-math.radians(float(a.get('yaw' if camera else 'rotationY',0))),-math.radians(float(a.get('roll' if camera else 'rotation',0)))),'XYZ')
def node(nt,kind): return nt.nodes.new(kind)
def link(nt,a,b): nt.links.new(a,b)
def color(a,key,default): return tuple(a.get(key,default))
def texture(nt,path,uv,linear=False):
    n=node(nt,'ShaderNodeTexImage');n.image=bpy.data.images.load(path,check_existing=True)
    if linear:n.image.colorspace_settings.name='Non-Color'
    link(nt,uv,n.inputs['Vector']);return n

def material(a):
    if a.get('materialX'):
        from materialx_osl import materialx_material
        return materialx_material(a['materialX'],str(a['id']),Path(request['output']).parent)
    m=bpy.data.materials.new(str(a['id']));m.use_nodes=True;nt=m.node_tree;nt.nodes.clear()
    out=node(nt,'ShaderNodeOutputMaterial');bs=node(nt,'ShaderNodeBsdfPrincipled')
    base=color(a,'baseColor',(1,1,1,1));bs.inputs['Base Color'].default_value=base
    pairs={'metallic':'Metallic','roughness':'Roughness','ior':'IOR','clearcoat':'Coat Weight','clearcoatRoughness':'Coat Roughness','transmission':'Transmission Weight','sheenRoughness':'Sheen Roughness','anisotropy':'Anisotropic','iridescenceIor':'Thin Film IOR','emissiveStrength':'Emission Strength'}
    for prop,socket in pairs.items():
        if prop in a:bs.inputs[socket].default_value=float(a[prop])
    bs.inputs['Specular IOR Level'].default_value=float(a.get('specular',1))*0.5
    bs.inputs['Specular Tint'].default_value=color(a,'specularColor',(1,1,1,1))
    bs.inputs['Sheen Tint'].default_value=color(a,'sheenColor',(0,0,0,1))
    bs.inputs['Sheen Weight'].default_value=max(a.get('sheenColor',[0,0,0])[:3])
    bs.inputs['Emission Color'].default_value=color(a,'emissive',(0,0,0,1))
    bs.inputs['Anisotropic Rotation'].default_value=float(a.get('anisotropyRotation',0))/360
    bs.inputs['Thin Film Thickness'].default_value=0
    uv=node(nt,'ShaderNodeTexCoord');mapping=node(nt,'ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(a.get('uvScaleX',1),a.get('uvScaleY',1),1);link(nt,uv.outputs['UV'],mapping.inputs[0]);coords=mapping.outputs[0]
    base_socket=None
    if a.get('baseColorMap'):
        tex=texture(nt,a['baseColorMap'],coords);mix=node(nt,'ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=base;link(nt,tex.outputs['Color'],mix.inputs[1]);base_socket=mix.outputs[0];link(nt,base_socket,bs.inputs['Base Color'])
    if a.get('metallicRoughnessMap'):
        tex=texture(nt,a['metallicRoughnessMap'],coords,True);sep=node(nt,'ShaderNodeSeparateColor');link(nt,tex.outputs[0],sep.inputs[0])
        for channel,prop,socket in [('Green','roughness','Roughness'),('Blue','metallic','Metallic')]:
            mul=node(nt,'ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=float(a.get(prop,0.5 if prop=='roughness' else 0));link(nt,sep.outputs[channel],mul.inputs[0]);link(nt,mul.outputs[0],bs.inputs[socket])
    if a.get('normalMap'):
        tex=texture(nt,a['normalMap'],coords,True);normal=node(nt,'ShaderNodeNormalMap');normal.inputs['Strength'].default_value=float(a.get('normalScale',1));link(nt,tex.outputs[0],normal.inputs['Color']);link(nt,normal.outputs[0],bs.inputs['Normal'])
    if a.get('emissiveMap'):
        tex=texture(nt,a['emissiveMap'],coords);mul=node(nt,'ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;mul.inputs[2].default_value=color(a,'emissive',(0,0,0,1));link(nt,tex.outputs[0],mul.inputs[1]);link(nt,mul.outputs[0],bs.inputs['Emission Color'])
    if a.get('occlusionMap'):
        tex=texture(nt,a['occlusionMap'],coords,True);mix=node(nt,'ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=base
        if base_socket:link(nt,base_socket,mix.inputs[1])
        link(nt,tex.outputs[0],mix.inputs[2]);link(nt,mix.outputs[0],bs.inputs['Base Color'])
    if a.get('displacementMap'):
        tex=texture(nt,a['displacementMap'],coords,True);disp=node(nt,'ShaderNodeDisplacement');disp.inputs['Scale'].default_value=float(a.get('displacementScale',0))*U;disp.inputs['Midlevel'].default_value=0;link(nt,tex.outputs[0],disp.inputs['Height']);link(nt,disp.outputs[0],out.inputs['Displacement']);m.displacement_method='BOTH'
    shader=bs.outputs[0]
    if float(a.get('iridescence',0))>0:
        film=node(nt,'ShaderNodeBsdfPrincipled')
        for index,socket in enumerate(bs.inputs):
            dest=film.inputs[index];dest.default_value=socket.default_value
            if socket.is_linked:link(nt,socket.links[0].from_socket,dest)
        film.inputs['Thin Film Thickness'].default_value=400
        mix=node(nt,'ShaderNodeMixShader');mix.inputs[0].default_value=float(a['iridescence']);link(nt,shader,mix.inputs[1]);link(nt,film.outputs[0],mix.inputs[2]);shader=mix.outputs[0]
    m['dispersion']=float(a.get('dispersion',0))
    if a.get('unlit'):
        em=node(nt,'ShaderNodeEmission');em.inputs['Color'].default_value=base
        if base_socket:link(nt,base_socket,em.inputs['Color'])
        shader=em.outputs[0]
    opacity=float(a.get('opacity',1));alpha=base[3] if a.get('alphaMode')!='opaque' else 1
    if a.get('alphaMode')=='mask':alpha=1 if alpha*opacity>=float(a.get('alphaCutoff',.5)) else 0;opacity=1
    # Geometric object opacity and material alpha use a physical transparent closure.
    if alpha*opacity<1 or a.get('baseColorMap') and a.get('alphaMode')!='opaque':
        transparent=node(nt,'ShaderNodeBsdfTransparent');mix=node(nt,'ShaderNodeMixShader');mix.inputs[0].default_value=alpha*opacity
        if a.get('baseColorMap') and a.get('alphaMode')!='opaque':
            tex=texture(nt,a['baseColorMap'],coords);mul=node(nt,'ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=alpha*opacity;link(nt,tex.outputs['Alpha'],mul.inputs[0]);factor=mul.outputs[0]
            if a.get('alphaMode')=='mask':
                step=node(nt,'ShaderNodeMath');step.operation='GREATER_THAN';step.inputs[1].default_value=float(a.get('alphaCutoff',.5));link(nt,factor,step.inputs[0]);factor=step.outputs[0]
            link(nt,factor,mix.inputs[0])
        link(nt,transparent.outputs[0],mix.inputs[1]);link(nt,shader,mix.inputs[2]);shader=mix.outputs[0]
    if not a.get('doubleSided',False):
        geo=node(nt,'ShaderNodeNewGeometry');transparent=node(nt,'ShaderNodeBsdfTransparent');mix=node(nt,'ShaderNodeMixShader');link(nt,geo.outputs['Backfacing'],mix.inputs[0]);link(nt,shader,mix.inputs[1]);link(nt,transparent.outputs[0],mix.inputs[2]);shader=mix.outputs[0]
    link(nt,shader,out.inputs['Surface'])
    if a.get('attenuationDistance') and float(a.get('transmission',0))>0:
        volume=node(nt,'ShaderNodeVolumeAbsorption');volume.inputs['Color'].default_value=color(a,'attenuationColor',(1,1,1,1));volume.inputs['Density'].default_value=1/(float(a['attenuationDistance'])*U);link(nt,volume.outputs[0],out.inputs['Volume'])
    return m
materials={str(a['id']):material(a) for a in request['materials']}
objects={}
def animated_import(a):
    source=a['source'];extension=Path(source).suffix.lower();before=set(scene.objects)
    if extension in ('.gltf','.glb'):bpy.ops.import_scene.gltf(filepath=source)
    elif extension=='.fbx':bpy.ops.import_scene.fbx(filepath=source,use_image_search=False)
    elif extension in ('.usd','.usda','.usdc','.usdz'):bpy.ops.wm.usd_import(filepath=source,apply_unit_conversion_scale=False,create_world_material=False)
    elif extension=='.obj':bpy.ops.wm.obj_import(filepath=source,forward_axis='Y',up_axis='Z')
    elif extension=='.ply':bpy.ops.wm.ply_import(filepath=source)
    elif extension=='.stl':bpy.ops.wm.stl_import(filepath=source)
    else:raise ValueError('animated import requires glTF, FBX or USD')
    imported=list(set(scene.objects)-before);clip=a.get('animationClip');found=False
    if clip:
        from io_scene_gltf2.blender.imp.animation_utils import restore_animation_on_object
        for ob in imported:
            targets=[ob]
            if ob.type=='MESH' and ob.data.shape_keys:targets.append(ob.data.shape_keys)
            if ob.type in ('LIGHT','CAMERA'):targets.append(ob.data)
            for target in targets:
                anim=target.animation_data
                if anim and any(track.name==clip for track in anim.nla_tracks):restore_animation_on_object(target,clip);found=True
                elif anim and anim.action and (anim.action.name==clip or anim.action.name.startswith(clip+'.')):found=True
                elif anim:anim.action=None
        if not found:raise ValueError('animation clip was not found: '+str(clip))
    frame=float(a.get('clipTime',0))*scene.render.fps;scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame))
    if a.get('materialVariant'):
        variants=getattr(scene,'gltf2_KHR_materials_variants_variants',[]);variant=next((v for v in variants if v.name==a['materialVariant']),None)
        if variant is None:raise ValueError('material variant was not found')
        for ob in imported:
            if ob.type=='MESH':
                for mapping in getattr(ob.data,'gltf2_variant_mesh_data',[]):
                    if variant.variant_idx in [v.variant.variant_idx for v in mapping.variants]:ob.material_slots[mapping.material_slot_index].material=mapping.material
    for ob in imported:
        if ob.type=='MESH' and ob.data.shape_keys and a.get('morphWeights') is not None:
            ob.data.shape_keys.animation_data_clear();blocks=list(ob.data.shape_keys.key_blocks)[1:]
            if len(a['morphWeights'])!=len(blocks):raise ValueError('morphWeights count mismatch')
            for block,weight in zip(blocks,a['morphWeights']):block.value=float(weight)
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();baked=[]
    for ob in imported:
        if ob.type=='MESH':
            evaluated=ob.evaluated_get(deps);data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps);data.transform(ob.matrix_world);data.transform(Matrix(((U,0,0,0),(0,0,-U,0),(0,U,0,0),(0,0,0,1))) if extension in ('.gltf','.glb') or (extension in ('.usd','.usda','.usdc','.usdz') and a.get('geometry',{}).get('upAxis')=='Y') else Matrix.Diagonal((U,-U,-U,1)));copy=bpy.data.objects.new('Baked mesh',data);scene.collection.objects.link(copy);baked.append(copy)
    for ob in imported:bpy.data.objects.remove(ob,do_unlink=True)
    if not baked:raise ValueError('animated asset contains no mesh')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in baked:ob.select_set(True)
    bpy.context.view_layer.objects.active=baked[0];bpy.ops.object.join();result=bpy.context.object;result.select_set(False);return result

def mesh_import(a):
    if a.get('source'):return animated_import(a)
    source=a['geometry'];verts=[];faces=[];uvs=[];slots=[];imported_materials=[]
    for index,spec in enumerate(source.get('materials',[])):
        props={p['key']:p['value'] for p in spec.get('properties',[]) if p.get('semantic',0)==0};diffuse=props.get('$clr.diffuse',[.8,.8,.8]);emissive=props.get('$clr.emissive',[0,0,0]);params={'id':a['id']+'_import_'+str(index),'baseColor':list(diffuse[:3])+[props.get('$mat.opacity',1)],'emissive':list(emissive[:3])+[1],'emissiveStrength':1,'doubleSided':bool(props.get('$mat.twosided',False)),'roughness':props.get('$mat.roughnessFactor',math.sqrt(2/(float(props.get('$mat.shininess',0))+2))),'metallic':props.get('$mat.metallicFactor',0),'ior':max(1,props.get('$mat.refracti',1.5))}
        for p in spec.get('properties',[]):
            if p['key']=='$tex.file':
                key={1:'baseColorMap',5:'normalMap',6:'normalMap',4:'emissiveMap',12:'baseColorMap'}.get(p.get('semantic'))
                if key:params[key]=p['value']
        imported_materials.append(material(params))
    if source.get('format')=='usd':
        for mesh in source['meshes']:
            matrix=Matrix(mesh['transform']).transposed();offset=len(verts)
            verts.extend([tuple(matrix@Vector(p)) for p in mesh['points']]);cursor=0
            for count in mesh['faceVertexCounts']:
                face=mesh['faceVertexIndices'][cursor:cursor+count];faces.append([offset+i for i in face]);uvs.extend([(0,0) for i in face]);cursor+=count
    else:
        def visit(n,parent):
            raw=n['transformation'];matrix=parent@Matrix([raw[i:i+4] for i in range(0,16,4)])
            for index in n.get('meshes',[]):
                mesh=source['meshes'][index];offset=len(verts);raw=mesh['vertices'];verts.extend([tuple(matrix@Vector(raw[i:i+3])) for i in range(0,len(raw),3)]);faces.extend([[offset+i for i in face] for face in mesh['faces']]);slots.extend([mesh.get('materialindex',0)]*len(mesh['faces']));channel=next(iter(mesh.get('texturecoords',[])),[]);stride=3 if len(channel)==len(raw) else 2;uvs.extend([tuple(channel[i*stride:i*stride+2]) if channel else (0,0) for face in mesh['faces'] for i in face])
            for child in n.get('children',[]):visit(child,matrix)
        visit(source['rootnode'],Matrix.Identity(4))
    data=bpy.data.meshes.new(a['id']);data.from_pydata([(p[0]*U,-p[1]*U,-p[2]*U) for p in verts],[],faces);data.update();uv=data.uv_layers.new()
    for loop,value in zip(uv.data,uvs):loop.uv=value
    for mat in imported_materials:data.materials.append(mat)
    for poly,index in zip(data.polygons,slots):poly.material_index=index
    ob=bpy.data.objects.new(a['id'],data);scene.collection.objects.link(ob);return ob
object_specs={str(a['id']):a for a in request['objects']};own_opacity={key:float(a.get('opacity',1)) for key,a in object_specs.items()}
for a in request['objects']:
    opacity=own_opacity[str(a['id'])];parent=a.get('parent');visited=set()
    while parent:
        if parent in visited:raise ValueError('3D parent cycle')
        visited.add(parent);ancestor=object_specs[str(parent)];opacity*=own_opacity[str(parent)];a['visible']=a.get('visible',True) and ancestor.get('visible',True);parent=ancestor.get('parent')
    a['opacity']=opacity
    kind=a['primitive'];r=float(a.get('radius',50))*U;w=float(a.get('width',r/U*2))*U;h=float(a.get('height',r/U*2))*U;d=float(a.get('depth',10))*U;n=int(a.get('segments',32))
    if n<3 or n>256:raise ValueError('3D segments exceeds budget')
    if kind=='empty':ob=bpy.data.objects.new(a['id'],None);scene.collection.objects.link(ob)
    elif kind=='mesh':ob=mesh_import(a)
    elif kind=='textured-plane':
        data=bpy.data.meshes.new(a['id']);data.from_pydata([(-w/2,h/2,0),(-w/2,-h/2,0),(w/2,-h/2,0),(w/2,h/2,0)],[],[(0,1,2,3)]);data.update();uv=data.uv_layers.new()
        for loop,coord in zip(uv.data,[(0,1),(0,0),(1,0),(1,1)]):loop.uv=coord
        ob=bpy.data.objects.new(a['id'],data);scene.collection.objects.link(ob)
        tex=bpy.data.images.new(a['id']+'_texture',a['textureWidth'],a['textureHeight'],alpha=True,float_buffer=True);rgba=np.fromfile(a['texture'],dtype=np.float32).reshape((a['textureHeight'],a['textureWidth'],4));alpha=rgba[:,:,3:4];rgba[:,:,:3]=np.divide(rgba[:,:,:3],alpha,out=np.zeros_like(rgba[:,:,:3]),where=alpha>1e-8);tex.colorspace_settings.name='Non-Color';tex.pixels.foreach_set(rgba[::-1].copy().ravel());tex.update()
        mat=bpy.data.materials.new(a['id']+'_surface');mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear();out=node(nt,'ShaderNodeOutputMaterial');em=node(nt,'ShaderNodeEmission');image=node(nt,'ShaderNodeTexImage');image.image=tex;link(nt,image.outputs['Color'],em.inputs['Color']);transparent=node(nt,'ShaderNodeBsdfTransparent');mix=node(nt,'ShaderNodeMixShader');link(nt,image.outputs['Alpha'],mix.inputs[0]);link(nt,transparent.outputs[0],mix.inputs[1]);link(nt,em.outputs[0],mix.inputs[2]);link(nt,mix.outputs[0],out.inputs['Surface']);ob.data.materials.append(mat)

    elif kind in ('text','extrude'):
        data=bpy.data.curves.new(a['id'],'FONT' if kind=='text' else 'CURVE');data.dimensions='2D';data.extrude=d/2;data.bevel_depth=float(a.get('bevel',0))*U;data.bevel_resolution=min(n,16);data.resolution_u=n
        if kind=='text':
            data.body=a.get('text','');data.size=h;data.align_x='CENTER';data.align_y='CENTER'
            if a.get('font'):data.font=bpy.data.fonts.load(a['font'])
        else:
            for points in a['contours']:
                spline=data.splines.new('POLY');spline.points.add(len(points)-1)
                for p,(x,y) in zip(spline.points,points):p.co=(x*U,-y*U,0,1)
                spline.use_cyclic_u=True
            data.fill_mode='BOTH'
        ob=bpy.data.objects.new(a['id'],data);scene.collection.objects.link(ob)
    else:
        if kind=='box':bpy.ops.mesh.primitive_cube_add(size=1);ob=bpy.context.object;ob.scale=(w,h,d)
        elif kind=='plane':bpy.ops.mesh.primitive_plane_add(size=1);ob=bpy.context.object;ob.scale=(w,h,1)
        elif kind=='sphere':bpy.ops.mesh.primitive_uv_sphere_add(segments=n,ring_count=max(3,n//2),radius=r);ob=bpy.context.object
        elif kind in ('cylinder','cone'):bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=0 if kind=='cone' else r,depth=h);ob=bpy.context.object;ob.rotation_euler[0]=math.pi/2
        elif kind=='torus':bpy.ops.mesh.primitive_torus_add(major_segments=n,minor_segments=max(3,n//2),major_radius=r,minor_radius=d/2);ob=bpy.context.object;ob.rotation_euler[0]=math.pi/2
        elif kind=='capsule':
            bpy.ops.mesh.primitive_uv_sphere_add(segments=n,ring_count=max(4,n//2),radius=r);ob=bpy.context.object
            for v in ob.data.vertices:v.co.z+=h/2 if v.co.z>=0 else -h/2
            ob.rotation_euler[0]=math.pi/2
        else:raise ValueError(f'unsupported geometry {kind}')
        bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);ob.select_set(False)
        if float(a.get('bevel',0))>0:
            bevel=ob.modifiers.new('Bevel','BEVEL');bevel.width=float(a['bevel'])*U;bevel.segments=min(n,16)
        # UV generated by Blender primitive constructors.
        if kind not in ('box','plane'):
            for poly in ob.data.polygons:poly.use_smooth=True
    ob.name=str(a['id']);objects[str(a['id'])]=ob
    ob.location=vec(a);ob.rotation_euler=rotation(a);ob.scale=(float(a.get('scaleX',1)),float(a.get('scaleY',1)),float(a.get('scaleZ',1)))
    ob.hide_render=not a.get('visible',True);ob.visible_shadow=bool(a.get('castShadow',True))
    if not a.get('renderVisible',True) and kind!='empty':
        ob.visible_camera=False
    if kind!='empty':
        mat=materials.get(str(a.get('material')))
        if mat is None and len(ob.data.materials):mat=ob.data.materials[0]
        if mat is None:mat=material({'id':str(a['id'])+'_default'})
        if a.get('material') and kind!='textured-plane':
            ob.data.materials.clear()
            for poly in getattr(ob.data,'polygons',[]):poly.material_index=0
        if a.get('material') or not len(ob.data.materials):ob.data.materials.append(mat)
        if float(a.get('opacity',1))<1:
            for slot in ob.material_slots:
                mat=slot.material.copy();slot.material=mat;nt=mat.node_tree;out=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL');shader=out.inputs['Surface'].links[0].from_socket;mix=node(nt,'ShaderNodeMixShader');transparent=node(nt,'ShaderNodeBsdfTransparent');mix.inputs[0].default_value=float(a['opacity']);link(nt,transparent.outputs[0],mix.inputs[1]);link(nt,shader,mix.inputs[2]);link(nt,mix.outputs[0],out.inputs['Surface'])
        material_spec=next((v for v in request['materials'] if str(v['id'])==str(a.get('material'))),{})
        if kind=='plane' and float(material_spec.get('thickness',0))>0:
            solid=ob.modifiers.new('Volume thickness','SOLIDIFY');solid.thickness=float(material_spec['thickness'])*U
        count=int(a.get('instances',1))
        if count>4096:raise ValueError('instance budget exceeded')
        for index in range(1,count):
            duplicate=ob.copy();duplicate.data=ob.data;scene.collection.objects.link(duplicate);duplicate.name=str(a['id'])+'_instance_'+str(index)

for a in request['objects']:
    if a.get('parent'):
        ob=objects[str(a['id'])];ob.parent=objects[str(a['parent'])];ob.hide_render|=ob.parent.hide_render
        for index in range(1,int(a.get('instances',1))):scene.objects[str(a['id'])+'_instance_'+str(index)].parent=ob.parent
# Black environment unless ambient/dome light explicitly requested.
world=bpy.data.worlds.new('World');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Strength'].default_value=0
for a in request['lights']:
    kind=a['type'];power=float(a.get('intensity',1))*2**float(a.get('exposure',0));rgb=tuple(a.get('color',(1,1,1,1)))
    if kind in ('ambient','dome'):
        nt=world.node_tree;out=nt.nodes.get('World Output');previous=out.inputs['Surface'].links[0].from_socket;bg=node(nt,'ShaderNodeBackground');bg.inputs['Color'].default_value=rgb;bg.inputs['Strength'].default_value=power;add=node(nt,'ShaderNodeAddShader');link(nt,previous,add.inputs[0]);link(nt,bg.outputs[0],add.inputs[1]);link(nt,add.outputs[0],out.inputs['Surface'])
        if a.get('environment'):
            env=node(nt,'ShaderNodeTexEnvironment');env.image=bpy.data.images.load(a['environment']);tint=node(nt,'ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=rgb;link(nt,env.outputs['Color'],tint.inputs[1]);link(nt,tint.outputs[0],bg.inputs['Color'])
        if a.get('colorTemperature'):
            blackbody=node(nt,'ShaderNodeBlackbody');blackbody.inputs[0].default_value=float(a['colorTemperature']);tint=node(nt,'ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=rgb
            if bg.inputs['Color'].is_linked:link(nt,bg.inputs['Color'].links[0].from_socket,tint.inputs[2])
            link(nt,blackbody.outputs[0],tint.inputs[1]);link(nt,tint.outputs[0],bg.inputs['Color'])
        path=node(nt,'ShaderNodeLightPath');gate=node(nt,'ShaderNodeMath');gate.operation='MULTIPLY';gate.inputs[0].default_value=1;gate.inputs[1].default_value=power
        if not a.get('affectsDiffuse',True):
            inv=node(nt,'ShaderNodeMath');inv.operation='SUBTRACT';inv.inputs[0].default_value=1;link(nt,path.outputs['Is Diffuse Ray'],inv.inputs[1]);link(nt,inv.outputs[0],gate.inputs[0])
        if not a.get('affectsSpecular',True):
            inv=node(nt,'ShaderNodeMath');inv.operation='SUBTRACT';inv.inputs[0].default_value=1;link(nt,path.outputs['Is Glossy Ray'],inv.inputs[1]);mul=node(nt,'ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=power;link(nt,inv.outputs[0],mul.inputs[0]);link(nt,mul.outputs[0],gate.inputs[1])
        link(nt,gate.outputs[0],bg.inputs['Strength'])
        if a.get('environmentVisible'):scene.render.film_transparent=False
        continue
    typ='SUN' if kind=='directional' else 'SPOT' if kind=='spot' else 'AREA' if kind in ('rect-area','disk-area') else 'POINT'
    data=bpy.data.lights.new(str(a['id']),typ);data.color=rgb[:3];data.energy=power*(1 if typ=='SUN' else 100);data.use_shadow=bool(a.get('castShadow',True)) and not a.get('mappedShadow',False);data.diffuse_factor=1 if a.get('affectsDiffuse',True) else 0;data.specular_factor=1 if a.get('affectsSpecular',True) else 0
    if typ=='AREA':data.shape='DISK' if kind=='disk-area' else 'RECTANGLE';data.size=float(a.get('width',2*a.get('radius',50)))*U;data.size_y=float(a.get('height',100))*U
    if typ in ('POINT','SPOT'):data.shadow_soft_size=float(a.get('radius',a.get('shadowSoftness',0)))*U
    if typ=='SUN':data.angle=math.radians(float(a.get('shadowSoftness',0)))
    if typ=='SPOT':data.spot_size=math.radians(float(a.get('spotAngle',45)));data.spot_blend=max(0,min(1,1-float(a.get('innerConeAngle',0))/float(a.get('spotAngle',45))))
    if float(a.get('range',0))>0:data.use_custom_distance=True;data.cutoff_distance=float(a['range'])*U
    if a.get('colorTemperature') or a.get('ies') or float(a.get('falloff',2))!=2:
        data.use_nodes=True;nt=data.node_tree;em=nt.nodes.get('Emission')
        if float(a.get('falloff',2))!=2:
            path=node(nt,'ShaderNodeLightPath');power_node=node(nt,'ShaderNodeMath');power_node.operation='POWER';power_node.inputs[1].default_value=2-float(a['falloff']);link(nt,path.outputs['Ray Length'],power_node.inputs[0]);mul=node(nt,'ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=data.energy;link(nt,power_node.outputs[0],mul.inputs[0]);link(nt,mul.outputs[0],em.inputs['Strength'])
        if a.get('colorTemperature'):
            blackbody=node(nt,'ShaderNodeBlackbody');blackbody.inputs[0].default_value=float(a['colorTemperature']);tint=node(nt,'ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=rgb;link(nt,blackbody.outputs[0],tint.inputs[1]);link(nt,tint.outputs[0],em.inputs['Color'])
        if a.get('ies'):
            ies=node(nt,'ShaderNodeTexIES');ies.mode='EXTERNAL';ies.filepath=a['ies'];ies.inputs['Strength'].default_value=1;mul=node(nt,'ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=data.energy
            if em.inputs['Strength'].is_linked:link(nt,em.inputs['Strength'].links[0].from_socket,mul.inputs[1])
            link(nt,ies.outputs[0],mul.inputs[0]);link(nt,mul.outputs[0],em.inputs['Strength'])
    ob=bpy.data.objects.new(str(a['id']),data);scene.collection.objects.link(ob);ob.location=vec(a);ob.rotation_euler=rotation(a,True)
# Split light receiver sets to honour per-object receiveShadow without changing the material.
receivers=[objects[str(a['id'])] for a in request['objects'] if a.get('receiveShadow') is False and a['primitive']!='empty']
if receivers:
    shadowed=bpy.data.collections.new('Shadowed receivers');unshadowed=bpy.data.collections.new('Unshadowed receivers')
    for ob in objects.values():
        if ob.type in ('MESH','CURVE','FONT'):(unshadowed if ob in receivers else shadowed).objects.link(ob)
    for lamp in list(scene.objects):
        if lamp.type=='LIGHT' and lamp.data.use_shadow:
            duplicate=lamp.copy();duplicate.data=lamp.data.copy();duplicate.data.use_shadow=False;scene.collection.objects.link(duplicate);duplicate.light_linking.receiver_collection=unshadowed;lamp.light_linking.receiver_collection=shadowed
# Cameras use the last active declaration.
a=next((c for c in request['cameras'] if c['id']==request.get('viewportCamera')),request['cameras'][-1] if request['cameras'] else {})
f=request['projectHeight']/2/math.tan(math.radians(float(a.get('fov',60)))/2)
data=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',data);scene.collection.objects.link(cam);scene.camera=cam
cam.location=vec(a) if request['cameras'] else Vector((0,0,f*U));cam.rotation_euler=rotation(a,True)
if a.get('parent'):cam.parent=objects[str(a['parent'])]
if a.get('target'):
    bpy.context.view_layer.update();target=objects[str(a['target'])].matrix_world.translation;look=(target-cam.matrix_world.translation).to_track_quat('-Z','Y');cam.rotation_euler=(cam.parent.matrix_world.to_quaternion().inverted()@look if cam.parent else look).to_euler();cam.rotation_euler.rotate_axis('Z',-math.radians(float(a.get('roll',0))))
data.type='ORTHO' if a.get('projection')=='orthographic' else 'PERSP';data.clip_start=float(a.get('near',0.1))*U;data.clip_end=float(a.get('far',10000))*U
data.sensor_fit='VERTICAL' if a.get('focalLength') and float(a.get('sensorHeight',24))/request['projectHeight']<float(a.get('sensorWidth',36))/request['projectWidth'] else 'HORIZONTAL';data.sensor_width=float(a.get('sensorWidth',36));data.sensor_height=float(a.get('sensorHeight',24));data.lens=float(a['focalLength']) if a.get('focalLength') else f*data.sensor_width/request['projectWidth'];data.ortho_scale=float(a.get('orthoHeight',request['projectHeight']))*request['projectWidth']/request['projectHeight']*U
data.lens*=float(a.get('zoomFactor',1));cam.rotation_euler.rotate_axis('Z',math.radians(float(a.get('shakeRotation',0))))
data.dof.use_dof=bool(a.get('depthOfField',False));data.dof.aperture_fstop=float(a.get('fStop',2.8));data.dof.aperture_blades=int(a.get('apertureBlades',0));data.dof.focus_distance=float(a.get('focusDistance',1000))*U
if a.get('focusTarget'):data.dof.focus_object=objects[str(a['focusTarget'])]
targets=dict(objects);targets.update({o.name:o for o in scene.objects if o.type=='LIGHT'});targets[str(a.get('id','camera'))]=cam
def constraint_offsets(ob,c):
    weight=float(c.get('influence',1));x=float(c.get('offsetX',0))*U;y=-float(c.get('offsetY',0))*U;r=-math.radians(float(c.get('offsetRotation',0)))
    if x or y or r:
        target=bpy.data.objects.new('Constraint offset',None);scene.collection.objects.link(target);target.location=(x,y,0);target.rotation_euler.z=r
        if x or y:
            con=ob.constraints.new('COPY_LOCATION');con.target=target;con.use_offset=True;con.influence=weight
        if r:
            con=ob.constraints.new('COPY_ROTATION');con.target=target;con.mix_mode='ADD';con.influence=weight

def apply_constraints(ob, specs):
    for c in specs:
        typ=c['type']
        if typ=='track':continue
        target=targets.get(str(c.get('target')))
        if typ=='follow-path':
            curve=bpy.data.curves.new('Constraint path','CURVE');curve.dimensions='3D';spline=curve.splines.new('POLY');points=c.get('pathPoints',[]);spline.points.add(len(points)-1)
            for p,(x,y) in zip(spline.points,points):p.co=(x*U,-y*U,0,1)
            target=bpy.data.objects.new('Constraint path',curve);scene.collection.objects.link(target);con=ob.constraints.new('FOLLOW_PATH');con.target=target;con.use_fixed_location=True;con.offset_factor=float(c.get('progress',0));con.use_curve_follow=bool(c.get('autoOrient',False));con.forward_axis='FORWARD_X';con.up_axis='UP_Z'
        elif target is None:raise ValueError('missing 3D constraint target')
        elif typ=='distance':
            for key,mode in [('minDistance','LIMITDIST_OUTSIDE'),('maxDistance','LIMITDIST_INSIDE')]:
                if key in c:
                    con=ob.constraints.new('LIMIT_DISTANCE');con.target=target;con.distance=float(c[key])*U;con.limit_mode=mode;con.influence=float(c.get('influence',1))
            constraint_offsets(ob,c);continue
        else:
            names={'parent':'CHILD_OF','copy-position':'COPY_LOCATION','copy-rotation':'COPY_ROTATION','copy-scale':'COPY_SCALE','copy-transform':'COPY_TRANSFORMS','look-at':'DAMPED_TRACK'}
            con=ob.constraints.new(names[typ]);con.target=target
            if typ=='look-at':con.track_axis='TRACK_NEGATIVE_Z' if ob.type in ('LIGHT','CAMERA') else 'TRACK_X'
            if hasattr(con,'owner_space'):con.owner_space='LOCAL' if c.get('space')=='local' else 'WORLD';con.target_space=con.owner_space
        con.influence=float(c.get('influence',1));constraint_offsets(ob,c)
for spec in request['objects']:apply_constraints(objects[str(spec['id'])],spec.get('constraints',[]))
for spec in request['lights']:
    if str(spec['id']) in scene.objects:apply_constraints(scene.objects[str(spec['id'])],spec.get('constraints',[]))
apply_constraints(cam,a.get('constraints',[]))
panorama=request.get('scene360')
if panorama and panorama.get('viewportCamera'):
    selected=next((c for c in request['cameras'] if c['id']==panorama['viewportCamera']),None)
    if selected:cam.location=vec(selected);cam.rotation_euler=rotation(selected,True)
base_rotation=cam.rotation_euler.to_quaternion();base_location=cam.location.copy()
def render_raw(width,height):
    scene.render.resolution_x=width;scene.render.resolution_y=height
    path=str(Path(request['output']).with_suffix('.exr'));scene.render.filepath=path
    dispersive=[m for m in bpy.data.materials if m.get('dispersion',0)>0]
    base_iors=[(n,n.inputs['IOR'].default_value,float(m['dispersion'])) for m in dispersive for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED']
    channels=[]
    for index in range(3 if dispersive else 1):
        for n,ior,dispersion in base_iors:n.inputs['IOR'].default_value=ior+(index-1)*(ior-1)*dispersion/40
        bpy.ops.render.render(write_still=True)
        image=bpy.data.images.load(path,check_existing=False);p=np.array(image.pixels[:],dtype=np.float32).reshape((height,width,4))[::-1].copy();bpy.data.images.remove(image);channels.append(p)
    for n,ior,dispersion in base_iors:n.inputs['IOR'].default_value=ior
    pixels=channels[0]
    if dispersive:
        pixels[:,:,1]=channels[1][:,:,1];pixels[:,:,2]=channels[2][:,:,2]
    pixels[:,:,:3]*=2**float(a.get('exposure',0));return pixels
from shadow_maps import ShadowMaps
mapped=[(scene.objects[str(s['id'])],s) for s in request['lights'] if s.get('mappedShadow') and s.get('castShadow') and s['type'] not in ('ambient','dome')]
shadow_maps=ShadowMaps(scene,objects,object_specs,U,request['materials']) if mapped else None

def render_pixels(width,height):
    pixels=render_raw(width,height);base=pixels.copy()
    for lamp,spec in mapped:
        hidden=lamp.hide_render;lamp.hide_render=True
        try:without=render_raw(width,height)
        finally:lamp.hide_render=hidden
        visibility=shadow_maps.mask(cam,width,height,lamp,spec)
        pixels[:,:,:3]-=(base[:,:,:3]-without[:,:,:3])*(1-visibility)
    # Environment NEE uses shadow rays too. Difference passes retain foreground
    # occlusion and all non-receiver pixels, including partially covered edges.
    if receivers and any(s['type'] in ('ambient','dome') for s in request['lights']):
        holdouts={ob:ob.is_holdout for ob in scene.objects if ob.type in ('MESH','CURVE','FONT')}
        shadows={ob:(ob.visible_shadow,ob.visible_diffuse,ob.visible_glossy) for ob in holdouts}
        try:
            for ob in holdouts:
                if ob not in receivers:ob.is_holdout=True
            shaded=render_raw(width,height)
            for ob in shadows:ob.visible_shadow=False;ob.visible_diffuse=False;ob.visible_glossy=False
            clear=render_raw(width,height)
            pixels[:,:,:3]+=clear[:,:,:3]-shaded[:,:,:3]
        finally:
            for ob,value in holdouts.items():ob.is_holdout=value
            for ob,value in shadows.items():ob.visible_shadow,ob.visible_diffuse,ob.visible_glossy=value
    return pixels

if panorama:
    layout=panorama.get('layout','equirectangular');stereo=panorama.get('stereo','mono');eyes=1 if stereo=='mono' else 2
    w=request['width']//(2 if stereo=='left-right' else 1);h=request['height']//(2 if stereo=='top-bottom' else 1)
    outputs=[]
    for eye in range(eyes):
        cam.location=base_location+base_rotation@Vector((((eye-.5)*float(panorama.get('interpupillary',.064))) if eyes==2 else 0,0,0))
        if layout in ('equirectangular','fisheye-180'):
            data.type='PANO';data.panorama_type='EQUIRECTANGULAR' if layout=='equirectangular' else 'FISHEYE_EQUIDISTANT';data.fisheye_fov=math.pi;cam.rotation_euler=base_rotation.to_euler();outputs.append(render_pixels(w,h))
        else:
            # Row-major 3x2 cube atlas: right, left, up / down, front, back.
            if w%3 or h%2 or w//3!=h//2:raise ValueError('cubemap/EAC requires six square faces in a 3x2 atlas')
            fw=w//3;fh=h//2;atlas=np.zeros((h,w,4),np.float32)
            data.type='PANO' if layout=='eac' else 'PERSP';data.panorama_type='EQUIANGULAR_CUBEMAP_FACE';data.lens=data.sensor_width/2
            for index,direction in enumerate([(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,-1),(0,0,1)]):
                q=Vector(direction).to_track_quat('-Z','Y');cam.rotation_euler=(base_rotation@q).to_euler();tile=render_pixels(fw,fh);atlas[(index//3)*fh:(index//3+1)*fh,(index%3)*fw:(index%3+1)*fw]=tile
            outputs.append(atlas)
    pixels=outputs[0] if eyes==1 else np.concatenate(outputs,axis=1 if stereo=='left-right' else 0)
else:pixels=render_pixels(request['width'],request['height'])
pixels.tofile(request['output'])
