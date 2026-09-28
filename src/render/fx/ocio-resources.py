"""Enumerate actual OCIO FileTransforms without executing image transforms."""
import sys,json
import PyOpenColorIO as ocio
config=ocio.Config.CreateFromStream(sys.stdin.read())
files=set()
def walk(t):
    if isinstance(t,ocio.FileTransform):files.add(t.getSrc())
    if isinstance(t,ocio.GroupTransform):
        for child in t:walk(child)
for item in config.getColorSpaces():
    for direction in [ocio.COLORSPACE_DIR_TO_REFERENCE,ocio.COLORSPACE_DIR_FROM_REFERENCE]:walk(item.getTransform(direction))
for item in config.getLooks():
    walk(item.getTransform());walk(item.getInverseTransform())
for item in config.getViewTransforms():
    for direction in [ocio.VIEWTRANSFORM_DIR_TO_REFERENCE,ocio.VIEWTRANSFORM_DIR_FROM_REFERENCE]:walk(item.getTransform(direction))
for item in config.getNamedTransforms():
    for direction in [ocio.TRANSFORM_DIR_FORWARD,ocio.TRANSFORM_DIR_INVERSE]:walk(item.getTransform(direction))
print(json.dumps({'files':sorted(files),'searchPaths':list(config.getSearchPaths())}))
