"""Regenerate asset input curves from colour-science 0.4.7 (BSD-3-Clause).
Development only: python -m pip install colour-science==0.4.7.
"""
import json
from pathlib import Path
import colour
import numpy as np
N=8192
x=np.linspace(0,1,N+1)
names={'slog3':'S-Log3','logc3':'ARRI LogC3','logc4':'ARRI LogC4','vlog':'V-Log','clog3':'Canon Log 3','redlog3g10':'Log3G10','flog2':'F-Log2','nlog':'N-Log','acescc':'ACEScc','acescct':'ACEScct'}
curves={key:[float(v) for v in colour.log_decoding(x,name)] for key,name in names.items()}
spaces={'srgb':'sRGB','linear-srgb':'sRGB','rec709':'ITU-R BT.709','display-p3':'Display P3','dci-p3':'DCI-P3','rec2020':'ITU-R BT.2020','acescg':'ACEScg','aces2065-1':'ACES2065-1','acescct':'ACEScg'}
matrices={key:colour.matrix_RGB_to_RGB(colour.RGB_COLOURSPACES[name],colour.RGB_COLOURSPACES['sRGB'],chromatic_adaptation_transform='Bradford').flatten().tolist() for key,name in spaces.items()}
matrices['xyz-d65']=colour.RGB_COLOURSPACES['sRGB'].matrix_XYZ_to_RGB.flatten().tolist()
Path('src/media/color-tables.json').write_text(json.dumps({'source':'colour-science 0.4.7, BSD-3-Clause','resolution':N,'curves':curves,'matrices':matrices},separators=(',',':'))+'\n')
