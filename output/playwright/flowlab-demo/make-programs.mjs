import fs from 'node:fs';
const dir='output/playwright/flowlab-demo/';
function program(name,imports,nodes,edges){fs.writeFileSync(dir+name+'.json',JSON.stringify({version:1,imports,nodes:nodes.map(([id,type,text,x,y,width])=>({id,type,text,position:{x,y},...(width?{width}:{})})),edges:edges.map(([source,target,label],i)=>({id:'e'+i,source,target,...(label?{label}:{})}))},null,2))}
program('Turtle-Spiral','turtle',[
['main','function','main',420,20],
['setup','process','length <- 2\ni <- 0\ncolor("#2563eb")',375,130],
['loop','while','i < 100',420,310],
['draw','process','forward(length)\nright(89)\nlength <- length + 2\ni <- i + 1',80,460,300],
['done','return','0',500,520]], [['main','setup'],['setup','loop'],['loop','draw','true'],['draw','loop'],['loop','done','false']]);
program('Pixel-Art','image',[
['main','function','main',430,20],
['setup','process','rows <- []\ny <- 0',385,130],
['loop','while','y < 40',430,290],
['row','process','row <- []\nx <- 0',65,425],
['inner','while','x < 40',65,570],
['pixel','process','r <- x * 6\ng <- y * 6\nb <- 180\nrow <- row + [[r, g, b]]\nx <- x + 1',-300,700,300],
['next','process','rows <- rows + [row]\ny <- y + 1',65,850],
['show','process','art <- image_from_pixels(rows)\nimshow(art)',610,445,350],
['done','return','0',650,660]], [['main','setup'],['setup','loop'],['loop','row','true'],['row','inner'],['inner','pixel','true'],['pixel','inner'],['inner','next','false'],['next','loop'],['loop','show','false'],['show','done']]);
