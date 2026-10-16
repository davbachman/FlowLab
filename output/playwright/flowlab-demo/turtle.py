from capture import *
code("await page.getByRole('button',{name:'Imports',exact:true}).click();")
record('08-turtle',"""await page.getByRole('button',{name:'Auto Step',exact:true}).click(); await page.waitForTimeout(2700); await page.getByRole('button',{name:'Pause',exact:true}).click(); await page.getByRole('button',{name:'Run',exact:true}).click(); await page.waitForTimeout(1100); await page.getByRole('img',{name:'Turtle drawing',exact:true}).dblclick(); await page.waitForTimeout(3800);""")
cli('screenshot','--filename',ROOT+'/turtle-preview.png')
