import subprocess, os, re, wave
import numpy as np
from PIL import Image, ImageDraw
D=os.path.dirname(os.path.abspath(__file__))
F='/private/tmp/flowlab-video-tools/node_modules/ffmpeg-static/ffmpeg'
font='/System/Library/Fonts/Supplemental/Arial.ttf'
bold='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
scenes=[('01-edit',7,'Programs you can see','Edit multiline blocks. Validate your flow. Run for instant output.'),('02-debug',11,'See every step','Breakpoints, live variables, branch highlights and adjustable Auto Step.'),('03-data',6,'Work with real data','Iterate through lists and collect results in dictionaries.'),('04-objects',7,'Go beyond a single flow','Build classes, call methods and follow execution into your objects.'),('05-input',6,'Make it interactive','Ask for input and watch conditions choose the next branch.'),('06-reference',5,'Explore the built-in libraries','Find available functions and discover math, text, image and turtle tools.'),('07-image',7,'Turn data into pixels','Nested loops build an image. Double-click to take a closer look.'),('08-turtle',11,'Bring your algorithms to life','Trace a recursive function, then expand its turtle drawing.')]
def run(args):
 p=subprocess.run([F,'-hide_banner','-loglevel','error','-y',*args],capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stderr)
def duration(path):
 p=subprocess.run([F,'-i',path],capture_output=True,text=True)
 m=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',p.stderr)
 return int(m[1])*3600+int(m[2])*60+float(m[3])
for i,(name,sec,title,sub) in enumerate(scenes):
 path=D+'/'+name+'.webm'
 dur=duration(path)
 filters=[f'setpts={sec/dur}*(PTS-STARTPTS)','fps=30','scale=1920:960:flags=lanczos','pad=1920:1080:0:120:color=0x111b30',f'drawtext=fontfile={bold}:text=FlowLab:fontsize=40:fontcolor=white:x=48:y=23',f'drawtext=fontfile={font}:text=THE 60-SECOND TOUR:fontsize=16:fontcolor=0x73ded3:x=50:y=73','drawbox=x=305:y=23:w=2:h=73:color=0x35415a:t=fill']
 for label,text,size,y,color in [('title',title,31,22,'white'),('sub',sub,22,70,'0xbcc9dc')]:
  txt=D+'/'+name+'-'+label+'.txt';open(txt,'w').write(text)
  filters.append(f'drawtext=fontfile={bold if label=="title" else font}:textfile={txt}:fontsize={size}:fontcolor={color}:x=342:y={y}')
 filters.append(f'drawtext=fontfile={font}:text={i+1:02d} / 08:fontsize=19:fontcolor=0x73ded3:x=1790:y=32')
 filters.append(f'drawbox=x=0:y=115:w={round(1920*(i+1)/8)}:h=5:color=0x37c7ba:t=fill')
 if i==7:
  filters+=['drawbox=x=340:y=66:w=1300:h=40:color=0x111b30:t=fill:enable=gte(t\,8.4)',f'drawtext=fontfile={bold}:text=davbachman.github.io/FlowLab:fontsize=25:fontcolor=0x73ded3:x=342:y=70:enable=gte(t\,8.4)']
 run(['-i',path,'-vf',','.join(filters),'-t',str(sec),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',D+'/'+name+'.mp4'])
 run(['-ss',str(sec*.67),'-i',D+'/'+name+'.mp4','-frames:v','1',D+'/'+name+'-check.png'])
 print(name,round(dur,2),'->',sec,flush=True)
# A quiet original synth bed: warm chords and sparse bell notes.
sr=48000;n=sr*60; track=np.zeros(n,dtype=np.float64)
chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,59]]
for bar in range(28):
 start=bar*60/112*4
 if start>=60:break
 dur=min(2.65,60-start); t=np.arange(int(sr*dur))/sr
 env=np.minimum(t/.25,1)*np.minimum((dur-t)/.7,1)
 for note in chords[bar%4]:
  f=440*2**((note-69)/12);v=(np.sin(2*np.pi*f*t)+.18*np.sin(4*np.pi*f*t))*.012*env
  a=int(start*sr); track[a:a+len(t)]+=v[:n-a]
 for k in [0,1.5,3]:
  at=start+k*60/112
  if at>=60:continue
  tt=np.arange(min(int(sr*.65),n-int(at*sr)))/sr
  f=440*2**((chords[bar%4][int(k)%4]+24-69)/12)
  vv=.026*np.sin(2*np.pi*f*tt)*np.exp(-tt*7)*np.minimum(tt/.006,1)
  a=int(at*sr);track[a:a+len(vv)]+=vv
track*=np.minimum(np.arange(n)/sr/1.2,1)*np.minimum((n-np.arange(n))/sr/2,1)
with wave.open(D+'/soundtrack.wav','wb') as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes(np.repeat((track*32767).astype('<i2')[:,None],2,axis=1).tobytes())
open(D+'/concat.txt','w').write(''.join("file '"+D+'/'+s[0]+".mp4'\n" for s in scenes))
run(['-f','concat','-safe','0','-i',D+'/concat.txt','-i',D+'/soundtrack.wav','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-t','60','-movflags','+faststart',D+'/FlowLab-Demo-60s.mp4'])
thumb=Image.new('RGB',(1280,1440),'#111b30')
for i,s in enumerate(scenes):
 im=Image.open(D+'/'+s[0]+'-check.png');im.thumbnail((640,360));thumb.paste(im,((i%2)*640,(i//2)*360))
thumb.save(D+'/contact-sheet.jpg')
print('FINAL',duration(D+'/FlowLab-Demo-60s.mp4'),flush=True)
