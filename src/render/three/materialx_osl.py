"""Compile MaterialX standard-library graphs to Cycles OSL closures."""
from pathlib import Path
import sys
import bpy
import MaterialX as mx
import MaterialX.PyMaterialXGenShader as gs
import MaterialX.PyMaterialXGenOsl as osl

def materialx_material(path,name,root):
    lib=mx.createDocument();search=mx.getDefaultDataSearchPath();mx.loadLibraries(mx.getDefaultDataLibraryFolders(),search,lib)
    document=mx.createDocument();mx.readFromXmlFile(document,str(path));document.importLibrary(lib)
    valid,errors=document.validate()
    if not valid:raise ValueError('invalid MaterialX document: '+errors)
    # Resolve filename inputs against their declaring document before OSL compilation.
    for element in document.traverseTree():
        if element.getAttribute('type')=='filename' and element.hasAttribute('value'):
            value=element.getAttribute('value')
            if value:
                uri=element.getActiveSourceUri();base=Path(uri).parent if uri else Path(path).parent
                resolved=(base/element.getActiveFilePrefix()/value).resolve()
                if not resolved.is_relative_to(Path(root).resolve()):raise ValueError('MaterialX filename escapes audited resource root')
                if not resolved.is_file():raise ValueError('MaterialX image dependency is absent')
                element.setAttribute('value',str(resolved));element.setFilePrefix('')
    elements=gs.findRenderableElements(document)
    if len(elements)!=1:raise ValueError('MaterialX document must contain exactly one renderable material')
    generator=osl.OslShaderGenerator.create();context=gs.GenContext(generator);context.registerSourceCodeSearchPath(search)
    shader=generator.generate('SceneMaterialX',elements[0],context);source=shader.getSourceCode(gs.PIXEL_STAGE)
    include=Path(mx.__file__).parent/'libraries/stdlib/genosl/include/mx_funcs.h'
    source=source.replace('#include "mx_funcs.h"','#include "'+str(include)+'"')
    target=Path(path).with_suffix('.compiled.osl');target.write_text(source)
    sys.path.append(str(Path(bpy.utils.resource_path('LOCAL'))/'python/lib/python3.11/site-packages'))
    bpy.context.scene.cycles.shading_system=True
    material=bpy.data.materials.new(name);material.use_nodes=True;nt=material.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');script=nt.nodes.new('ShaderNodeScript');script.mode='EXTERNAL';script.filepath=str(target)
    from cycles.osl import update_script_node
    errors=[]
    def report(level,message):
        if 'ERROR' in level:errors.append(message)
    if not update_script_node(script,report) or errors:raise ValueError('MaterialX OSL compilation failed: '+'; '.join(errors))
    if len(script.outputs)!=1 or script.outputs[0].type!='SHADER':raise ValueError('MaterialX graph must produce a surface closure')
    nt.links.new(script.outputs[0],out.inputs['Surface']);return material
