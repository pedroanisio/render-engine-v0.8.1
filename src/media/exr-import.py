"""Decode selected OpenEXR part/channel set to unbounded float RGBA."""
import json
import sys
import numpy as np
import OpenEXR
with OpenEXR.File(sys.argv[1], separate_channels=True) as image:
    selector = sys.argv[2] if len(sys.argv) > 2 else ''
    part = image.parts[0]
    prefix = ''
    if selector:
        matches = [p for i, p in enumerate(image.parts) if str(i) == selector or p.header.get('name') == selector]
        if matches:
            part = matches[0]
        elif all(selector + '.' + channel in part.channels for channel in 'RGB'):
            prefix = selector + '.'
        else:
            raise ValueError('missing EXR part or channel set: ' + selector)
    channels = part.channels
    reference = next(iter(channels.values())).pixels
    height, width = reference.shape[:2]
    output = np.empty((height, width, 4), dtype='<f4')
    for i, name in enumerate('RGBA'):
        channel = channels.get(prefix + name)
        if channel is None and name != 'A':
            channel = channels.get(prefix + 'Y')
        output[:, :, i] = channel.pixels if channel is not None else (1 if name == 'A' else 0)
    if not np.isfinite(output).all():
        raise ValueError('EXR contains non-finite samples')
    sys.stdout.buffer.write((json.dumps({'width':width,'height':height})+'\n').encode())
    sys.stdout.buffer.write(output.tobytes())
