"""Import an FBX camera/object track with Blender's audited FBX reader."""
import sys,json,math
from pathlib import Path
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=sys.argv[1],use_image_search=False,anim_offset=0)
scene=bpy.context.scene
fps=float(sys.argv[3]);source_fps=scene.render.fps/scene.render.fps_base
objects=sorted(scene.objects,key=lambda o:(o.type!='CAMERA',o.name))
if not objects:raise ValueError('FBX tracking has no objects')
animated=[o for o in objects if o.animation_data]
source=next((o for o in objects if o.type=='CAMERA'), animated[0] if animated else objects[0])
ranges=[a.frame_range for a in bpy.data.actions]
start=math.floor(min((a[0] for a in ranges),default=0)/source_fps*fps);end=math.ceil(max((a[1] for a in ranges),default=0)/source_fps*fps)
if end-start>100000:raise ValueError('FBX tracking frame budget exceeded')
keys=[]
for frame in range(start,end+1):
    source_frame=frame/fps*source_fps;scene.frame_set(math.floor(source_frame),subframe=source_frame-math.floor(source_frame));world=source.matrix_world;x,y,z=world.translation;e=world.to_euler();scale=world.to_scale()
    key=dict(time=frame/fps,x=x*100,y=-y*100,z=-z*100,rotation=-math.degrees(e.z),rotationX=math.degrees(e.x),rotationY=-math.degrees(e.y),pitch=math.degrees(e.x),yaw=-math.degrees(e.y),roll=-math.degrees(e.z),scaleX=scale.x,scaleY=scale.y,scaleZ=scale.z)
    if source.type=='CAMERA':key['focalLength']=source.data.lens;key['fov']=math.degrees(source.data.angle_y)
    key['points']={o.name:dict(x=o.matrix_world.translation.x*100,y=-o.matrix_world.translation.y*100,z=-o.matrix_world.translation.z*100) for o in objects}
    keys.append(key)
Path(sys.argv[2]).write_text(json.dumps(keys))
