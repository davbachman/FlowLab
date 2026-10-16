from capture import *
record('06-reference',"""await page.waitForTimeout(1200); await page.getByRole('heading',{name:'Available libraries',exact:true}).scrollIntoViewIfNeeded(); await page.waitForTimeout(2800);""")
code("await page.getByRole('button',{name:'Close',exact:true}).click(); await page.getByRole('button',{name:'File',exact:true}).click();")
cli('snapshot')
code("const picker=page.waitForEvent('filechooser'); await page.getByRole('menuitem',{name:'Load',exact:true}).click(); await (await picker).setFiles("+repr(ROOT+'/Pixel-Art.json')+"); await page.getByRole('button',{name:'Fit View',exact:true}).click(); await page.getByRole('button',{name:'Run',exact:true}).click(); await page.waitForTimeout(1000);")
cli('snapshot')
cli('screenshot','--filename',ROOT+'/image-preview.png')
