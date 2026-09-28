"""Bounded float-image bridge for OpenColorIO and offline EGL GLSL shaders."""
import json, sys, pathlib, tempfile, base64, re
import numpy as np
header = json.loads(sys.stdin.buffer.readline())
w,h = header['width'],header['height']
count=w*h*4
raw=sys.stdin.buffer.read()
image=np.frombuffer(raw[:count*4], dtype='<f4').copy().reshape(h,w,4)
with tempfile.TemporaryDirectory(prefix='scene-fx-') as directory:
    root=pathlib.Path(directory)
    for name,data in header.get('files',{}).items():
        path=(root/name).resolve()
        if not path.is_relative_to(root): raise ValueError('external dependency escapes bundle')
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(base64.b64decode(data))
    kind=header['kind']
    if kind=='shader':
        import moderngl
        ctx=moderngl.create_standalone_context(backend='egl')
        shader=header['shader']
        shader=re.sub(r'^\s*#version[^\n]*','',shader,flags=re.M)
        shader=re.sub(r'precision\s+\w+\s+\w+\s*;','',shader)
        shader=shader.replace('texture2D(', 'texture(')
        shader=shader.replace('gl_FragColor','result')
        prefix='#version 330\n'
        for qualifier,typ,name in [('in','vec2','uv'),('out','vec4','result'),('uniform','sampler2D','from'),('uniform','sampler2D','to')]:
            shader=re.sub(r'(?:layout\s*\([^)]*\)\s*)?\b'+qualifier+r'\s+'+typ+r'\s+'+name+r'\s*;', '',shader)
            prefix+=f'{qualifier} {typ} {name};\n'
        prefix+='vec4 getFromColor(vec2 p){return texture(from,p); }\nvec4 getToColor(vec2 p){return texture(to,p); }\n'
        for typ,name in [('float','progress'),('float','time'),('vec2','resolution')]:
            if not re.search(r'\buniform\s+\w+\s+'+name+r'\b',shader): prefix+=f'uniform {typ} {name};\n'
        if re.search(r'\bvec4\s+transition\s*\(',shader): shader+='\nvoid main(){result=transition(uv);}'
        elif re.search(r'\bvec4\s+effect\s*\(',shader): shader+='\nvoid main(){result=effect(uv);}'
        elif not re.search(r'\bvoid\s+main\s*\(',shader): raise ValueError('shader must define main(), vec4 effect(vec2), or vec4 transition(vec2)')
        prog=ctx.program(vertex_shader='#version 330\nin vec2 position; out vec2 uv; void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0,1);}',fragment_shader=prefix+shader)
        second=np.frombuffer(raw[count*4:],dtype='<f4').reshape(h,w,4) if len(raw)>count*4 else image
        for i,data in enumerate([image,second]):
            texture=ctx.texture((w,h),4,np.ascontiguousarray(data).tobytes(),dtype='f4');texture.filter=(moderngl.LINEAR,moderngl.LINEAR);texture.repeat_x=False;texture.repeat_y=False;texture.use(i)
        if any(name not in prog for name in header.get('params',{})): raise ValueError('unknown or inactive shader uniform')
        for name,value in {'from':0,'to':1,'time':header.get('time',0),'progress':header.get('progress',0),'resolution':(w,h),**header.get('params',{})}.items():
            if name in prog: prog[name].value=tuple(value) if isinstance(value,list) else value
        buffer=ctx.buffer(np.array([-1,-1,1,-1,-1,1,1,1],dtype='f4').tobytes())
        vao=ctx.simple_vertex_array(prog,buffer,'position');fbo=ctx.simple_framebuffer((w,h),4,dtype='f4');fbo.use();vao.render(moderngl.TRIANGLE_STRIP)
        output=np.frombuffer(fbo.read(components=4,dtype='f4'),dtype='<f4').reshape(h,w,4).copy()
        ctx.release()
    else:
        import PyOpenColorIO as ocio
        alpha=image[:,:,3:4].copy()
        image[:,:,:3]=np.divide(image[:,:,:3],alpha,out=np.zeros_like(image[:,:,:3]),where=alpha!=0)
        if kind=='lut':
            cfg=ocio.Config.CreateRaw()
            transform=ocio.FileTransform(src=str(root/header['src']),interpolation=ocio.INTERP_BEST)
            cpu=cfg.getProcessor(transform).getDefaultCPUProcessor()
        elif kind=='aces2':
            cfg=ocio.Config.CreateFromBuiltinConfig('cg-config-v4.0.0_aces-v2.0_ocio-v2.5')
            cpu=cfg.getProcessor('Linear Rec.709 (sRGB)','sRGB - Display','ACES 2.0 - SDR 100 nits (Rec.709)',ocio.TRANSFORM_DIR_FORWARD).getDefaultCPUProcessor()
        elif kind=='builtin-display':
            cfg=ocio.Config.CreateFromFile(str(pathlib.Path(__file__).parent/'color'/'config.ocio'))
            cpu=cfg.getProcessor('Linear Rec.709','sRGB',header['view'],ocio.TRANSFORM_DIR_FORWARD).getDefaultCPUProcessor()
        elif kind=='ocio-convert':
            cfg=ocio.Config.CreateFromFile(str(root/header['src']))
            aliases={'linear-srgb':'Linear Rec.709 (sRGB)','srgb':'sRGB Encoded Rec.709 (sRGB)','acescg':'ACEScg','acescct':'ACEScct','aces2065-1':'ACES2065-1'}
            def resolve(name):return name if cfg.getColorSpace(name) else aliases.get(name,name)
            cpu=cfg.getProcessor(resolve(header['from']),resolve(header['to'])).getDefaultCPUProcessor()
        elif kind=='ocio':
            cfg=ocio.Config.CreateFromFile(str(root/header['src']))
            cfg.validate()
            transform=ocio.DisplayViewTransform(src=header['workingSpace'],display=header['display'],view=header['view'])
            if header.get('looks'):
                group=ocio.GroupTransform();group.appendTransform(ocio.LookTransform(src=header['workingSpace'],dst=header['workingSpace'],looks=','.join(header['looks'])));group.appendTransform(transform);transform=group
            cpu=cfg.getProcessor(transform).getDefaultCPUProcessor()
        else: raise ValueError('unknown native operation')
        cpu.applyRGBA(image)
        image[:,:,:3]*=alpha
        image[:,:,3:4]=alpha
        output=image
    if not np.isfinite(output).all(): raise ValueError('non-finite output from native operation')
    sys.stdout.buffer.write(output.astype('<f4').tobytes())
