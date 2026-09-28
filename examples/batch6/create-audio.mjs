import { writeFloatWav } from '../../src/render/audio.js';
import { fileURLToPath } from 'node:url';
const rate=44100,duration=8;
const music=Float32Array.from({length:rate*4*2},(_,i)=>{const t=Math.floor(i/2)/rate,c=i%2;return .07*(Math.sin(2*Math.PI*220*t)+.5*Math.sin(2*Math.PI*(c?330:275)*t))*(.65+.35*Math.exp(-(t%.5)*12));});
const lead=Float32Array.from({length:rate*duration},(_,i)=>{const t=i/rate,local=t%2;return local>.35&&local<1.1?.2*Math.sin(2*Math.PI*(440+110*Math.floor(t/2))*t)*Math.sin(Math.PI*(local-.35)/.75)**2:0;});
writeFloatWav(fileURLToPath(new URL('./assets/music.wav',import.meta.url)),music,rate,2);
writeFloatWav(fileURLToPath(new URL('./assets/lead.wav',import.meta.url)),lead,rate,1);
