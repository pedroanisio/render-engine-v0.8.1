"""Import OpenUSD geometry after auditing each dependency inside the project root."""
import json
import sys
import tempfile
import zipfile
from pathlib import Path
from pxr import Sdf, Usd, UsdGeom
source = Path(sys.argv[1]).resolve()
root = Path(sys.argv[2]).resolve()
files = set()
seen = set()

def contained(path, boundary):
    resolved = path.resolve()
    if not resolved.is_relative_to(boundary):
        raise ValueError(f"USD asset escapes scene directory: {path}")
    if not resolved.is_file():
        raise ValueError(f"missing USD dependency: {path}")
    return resolved

def audit(path, boundary, record=True):
    path = contained(path, boundary)
    if path in seen:
        return
    seen.add(path)
    if record:
        files.add(str(path.relative_to(root)))
    if path.suffix.lower() not in ('.usd', '.usda', '.usdc'):
        return
    layer = Sdf.Layer.FindOrOpen(str(path))
    if not layer:
        raise ValueError(f"invalid USD layer: {path}")
    dependencies=set(layer.GetExternalReferences()) | set(layer.GetExternalAssetDependencies())
    def collect(value):
        if isinstance(value,Sdf.AssetPath):
            if value.path:dependencies.add(value.path)
        elif isinstance(value,(list,tuple)) or type(value).__name__=='AssetPathArray':
            for item in value:collect(item)
    def visit(property_path):
        spec=layer.GetObjectAtPath(property_path)
        if isinstance(spec,Sdf.AttributeSpec):
            collect(spec.default)
            for time in layer.ListTimeSamplesForPath(property_path):collect(layer.QueryTimeSample(property_path,time))
    layer.Traverse(Sdf.Path.absoluteRootPath,visit)
    for uri in dependencies:
        if ':' in uri or '[' in uri:
            raise ValueError(f"unsupported external USD resolver: {uri}")
        if '<UDIM>' in uri:
            candidates=sorted((path.parent / uri).parent.glob((path.parent / uri).name.replace('<UDIM>','1[0-9][0-9][0-9]')))
            if not candidates:raise ValueError('missing USD UDIM tiles')
            for candidate in candidates:audit(candidate,boundary,record)
        else:audit(path.parent / uri, boundary, record)

def geometry(path):
    stage = Usd.Stage.Open(str(path))
    if not stage:
        raise ValueError("invalid USD stage")
    meshes = []
    for prim in stage.Traverse():
        if prim.IsA(UsdGeom.Mesh):
            mesh = UsdGeom.Mesh(prim)
            meshes.append({"path":str(prim.GetPath()), "points":[list(p) for p in mesh.GetPointsAttr().Get() or []], "faceVertexCounts":list(mesh.GetFaceVertexCountsAttr().Get() or []), "faceVertexIndices":list(mesh.GetFaceVertexIndicesAttr().Get() or []), "normals":[list(p) for p in mesh.GetNormalsAttr().Get() or []], "transform":[list(row) for row in UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default())]})
    return {"format":"usd", "upAxis":str(UsdGeom.GetStageUpAxis(stage)), "meshes":meshes, "timeCodesPerSecond":stage.GetTimeCodesPerSecond(), "startTimeCode":stage.GetStartTimeCode(), "endTimeCode":stage.GetEndTimeCode(), "dependencies":sorted(files)}

if source.suffix.lower() == '.usdz':
    contained(source, root)
    files.add(str(source.relative_to(root)))
    with tempfile.TemporaryDirectory(prefix='scene-usdz-') as folder:
        boundary = Path(folder).resolve()
        with zipfile.ZipFile(source) as package:
            if sum(item.file_size for item in package.infolist()) > 1024**3:
                raise ValueError('USDZ package exceeds 1 GiB expanded size')
            for item in package.infolist():
                if not (boundary / item.filename).resolve().is_relative_to(boundary):
                    raise ValueError('USDZ member escapes package')
            package.extractall(boundary)
            first = boundary / package.namelist()[0]
        audit(first, boundary, False)
        result = geometry(first)
else:
    audit(source, root)
    result = geometry(source)
print(json.dumps(result))
