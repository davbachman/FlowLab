import os,glob,re,subprocess
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__)); F='/private/tmp/flowlab-video-tools/node_modules/ffmpeg-static/ffmpeg'
ims=[]
for p in sorted(glob.glob(D+'/*.webm')):
 log=subprocess.run([F,'-i',p],capture_output=True,text=True).stderr
 m=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',log)
 dur=int(m[1])*3600+int(m[2])*60+float(m[3]);out=p+'.png'
 subprocess.run([F,'-loglevel','error','-y','-ss',str(dur*.7),'-i',p,'-frames:v','1',out],check=True)
 im=Image.open(out);im.thumbnail((800,400));ims.append(im)
canvas=Image.new('RGB',(1600,400*((len(ims)+1)//2)))
for i,im in enumerate(ims):canvas.paste(im,((i%2)*800,(i//2)*400))
canvas.save(D+'/raw-contact.jpg')
