"""Sparse fixed-resolution depth maps for authored shadow-map controls.

Texels are evaluated lazily with the evaluated-geometry BVH. This gives the same
nearest-texel depth comparison as a full map without allocating six 8192² faces.
The map resolution controls angular/spatial quantisation, never sample count.
"""
import math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


def tree(objects, deps):
    vertices=[];faces=[]
    for ob in objects:
        if ob.type not in ('MESH','CURVE','FONT') or ob.hide_render:continue
        evaluated=ob.evaluated_get(deps);mesh=evaluated.to_mesh();offset=len(vertices)
        vertices.extend([ob.matrix_world@v.co for v in mesh.vertices])
        faces.extend([tuple(offset+i for i in p.vertices) for p in mesh.polygons]);evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(vertices,faces),vertices


def camera_ray(camera,x,y,width,height):
    u=(x+.5)/width;v=(y+.5)/height;data=camera.data;rotation=camera.matrix_world.to_quaternion()
    if data.type=='ORTHO':
        return camera.matrix_world.translation+rotation@Vector(((u-.5)*data.ortho_scale,(.5-v)*data.ortho_scale*height/width,0)),rotation@Vector((0,0,-1))
    if data.type=='PANO':
        if data.panorama_type=='EQUIRECTANGULAR':
            phi=(u-.5)*2*math.pi;theta=(.5-v)*math.pi;d=Vector((math.sin(phi)*math.cos(theta),math.sin(theta),-math.cos(phi)*math.cos(theta)))
        elif data.panorama_type=='EQUIANGULAR_CUBEMAP_FACE':d=Vector((math.tan((u-.5)*math.pi/2),math.tan((.5-v)*math.pi/2),-1))
        else:
            px=(u-.5)*2;py=(.5-v)*2;r=math.hypot(px,py)
            if r>1:return None,None
            theta=r*math.pi/2;d=Vector((math.sin(theta)*px/(r or 1),math.sin(theta)*py/(r or 1),-math.cos(theta)))
    else:
        frame=data.view_frame(scene=__import__('bpy').context.scene);right=max(p.x/-p.z for p in frame);top=max(p.y/-p.z for p in frame)
        d=Vector(((2*u-1)*right,(1-2*v)*top,-1))
    return camera.matrix_world.translation,rotation@d.normalized()


class ShadowMaps:
    def __init__(self,scene,objects,specs,unit,materials=()):
        import bpy
        self.scene=scene;self.objects=objects;self.specs=specs;self.unit=unit
        bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
        self.casters,self.vertices=tree([ob for ob in scene.objects if ob.type in ('MESH','CURVE','FONT') and ob.visible_shadow],deps)
        self.materials={str(m['id']):m for m in materials};self.alpha_images={};self.blockers=[];self.uvs={}
        for ob in scene.objects:
            if ob.type in ('MESH','CURVE','FONT') and ob.visible_shadow and not ob.hide_render:
                bvh,_=tree([ob],deps);self.blockers.append((ob,bvh))
                evaluated=ob.evaluated_get(deps);mesh=evaluated.to_mesh();uv=mesh.uv_layers.active
                if uv:self.uvs[ob.name]=[([ob.matrix_world@mesh.vertices[i].co for i in poly.vertices],[Vector((uv.data[i].uv.x,uv.data[i].uv.y,0)) for i in poly.loop_indices]) for poly in mesh.polygons]
                evaluated.to_mesh_clear()
        self.receivers={};self.extent=max(1e-4,max((v.length for v in self.vertices),default=1)*2)
        self.primary=[]
        for ob in objects.values():
            if ob.type in ('MESH','CURVE','FONT') and ob.visible_camera and not ob.hide_render:
                t,_=tree([ob],deps);self.primary.append((ob,t))
        self.cache={}

    def alpha(self,ob,p,face):
        spec=self.specs.get(ob.name,self.specs.get(ob.name.split('_instance_')[0],{}));opacity=float(spec.get('opacity',1))
        if spec.get('primitive')=='textured-plane':
            if ob.name not in self.alpha_images:self.alpha_images[ob.name]=np.fromfile(spec['texture'],dtype=np.float32).reshape((spec['textureHeight'],spec['textureWidth'],4))[:,:,3]
            image=self.alpha_images[ob.name];local=ob.matrix_world.inverted()@p
            u=local.x/(float(spec['width'])*self.unit)+.5;v=.5-local.y/(float(spec['height'])*self.unit)
            x=min(image.shape[1]-1,max(0,int(u*image.shape[1])));y=min(image.shape[0]-1,max(0,int(v*image.shape[0])))
            return opacity*float(image[y,x])
        mat=self.materials.get(str(spec.get('material')),{});opacity*=float(mat.get('opacity',1))
        if mat.get('alphaMode')!='opaque':opacity*=float(mat.get('baseColor',[1,1,1,1])[3])
        if mat.get('baseColorMap') and mat.get('alphaMode')!='opaque' and ob.name in self.uvs:
            import bpy
            path=mat['baseColorMap']
            if path not in self.alpha_images:
                image=bpy.data.images.load(path,check_existing=True);self.alpha_images[path]=np.array(image.pixels[:],dtype=np.float32).reshape((image.size[1],image.size[0],4))[:,:,3]
            vertices,uvs=self.uvs[ob.name][face];uv=barycentric_transform(p,vertices[0],vertices[1],vertices[2],uvs[0],uvs[1],uvs[2]);image=self.alpha_images[path]
            x=int((uv.x*float(mat.get('uvScaleX',1))%1)*image.shape[1]);y=int((uv.y*float(mat.get('uvScaleY',1))%1)*image.shape[0]);opacity*=float(image[y,x])
        if mat.get('alphaMode')=='mask':opacity=float(opacity>=float(mat.get('alphaCutoff',.5)))
        return opacity

    def visibility(self,lamp,spec,p,normal,offset=(0,0)):
        size=int(spec.get('shadowMapSize',2048));bias=float(spec.get('shadowBias',.0005))*self.extent
        center=lamp.matrix_world.translation
        if lamp.data.type=='SUN':
            rotation=lamp.matrix_world.to_quaternion();local=rotation.inverted()@p
            ix=math.floor((local.x/self.extent+.5)*size);iy=math.floor((local.y/self.extent+.5)*size);ix+=offset[0];iy+=offset[1]
            origin=rotation@Vector((((ix+.5)/size-.5)*self.extent,((iy+.5)/size-.5)*self.extent,self.extent))
            direction=rotation@Vector((0,0,-1));distance=self.extent-local.z;key=(lamp.name,ix,iy)
        else:
            delta=p-center;axis=max(range(3),key=lambda k:abs(delta[k]));sign=1 if delta[axis]>=0 else -1;other=[k for k in range(3) if k!=axis];den=abs(delta[axis]) or 1e-12
            u=delta[other[0]]/den;v=delta[other[1]]/den;ix=math.floor((u+1)*.5*size);iy=math.floor((v+1)*.5*size);ix+=offset[0];iy+=offset[1]
            direction=Vector((0,0,0));direction[axis]=sign;direction[other[0]]=(ix+.5)/size*2-1;direction[other[1]]=(iy+.5)/size*2-1;direction.normalize()
            origin=center;distance=delta.dot(direction);key=(lamp.name,axis,sign,ix,iy)
        # Receiver-plane correction removes quantisation acne on sloped surfaces.
        dot=direction.dot(normal)
        if abs(dot)>1e-8:distance=(p-origin).dot(normal)/dot
        if key not in self.cache:
            layers=[]
            for ob,bvh in self.blockers:
                cursor=origin.copy();travel=0
                for _ in range(64):
                    hit=bvh.ray_cast(cursor,direction)
                    if hit[0] is None:break
                    travel+=hit[3];alpha=self.alpha(ob,hit[0],hit[2])
                    if alpha>0:layers.append((travel,alpha))
                    step=max(1e-7,self.extent*1e-7);cursor=hit[0]+direction*step;travel+=step
            self.cache[key]=sorted(layers)
        transmittance=1.0
        for depth,alpha in self.cache[key]:
            if depth>=distance-bias:break
            transmittance*=1-alpha
        return transmittance

    def mask(self,camera,width,height,lamp,spec):
        result=np.ones((height,width,1),np.float32)
        for y in range(height):
            for x in range(width):
                origin,direction=camera_ray(camera,x,y,width,height)
                if origin is None:continue
                best=math.inf;point=None;receiver=None;normal=None
                for ob,bvh in self.primary:
                    hit=bvh.ray_cast(origin,direction)
                    if hit[0] is not None and hit[3]<best:point=hit[0];receiver=ob;best=hit[3];normal=hit[1]
                if point is not None and self.specs.get(receiver.name,{}).get('receiveShadow',True):
                    softness=float(spec.get('shadowSoftness',0));radius=max(1,round(softness*self.unit*int(spec.get('shadowMapSize',2048))/self.extent))
                    offsets=[(0,0)] if softness==0 else [(dx*radius,dy*radius) for dx in (-1,0,1) for dy in (-1,0,1)]
                    result[y,x,0]=sum(self.visibility(lamp,spec,point,normal,o) for o in offsets)/len(offsets)
        return result
