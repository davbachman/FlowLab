from capture import *
code("if(await page.getByRole('button',{name:'Collapse output',exact:true}).isVisible()) await page.getByRole('button',{name:'Collapse output',exact:true}).click(); await page.getByRole('button',{name:'Fit View',exact:true}).click();")
record('07-image',"""await page.waitForTimeout(600); await page.getByRole('button',{name:'Run',exact:true}).click(); await page.waitForTimeout(1700); await page.getByLabel('Displayed image',{exact:true}).dblclick(); await page.waitForTimeout(2500);""")
code("await page.getByRole('button',{name:'Close',exact:true}).click(); await page.getByRole('button',{name:'File',exact:true}).click(); await page.getByRole('menuitem',{name:'Load',exact:true}).click();")
cli('upload',ROOT+'/Recursive-Tree.json')
code("await page.getByRole('button',{name:'Fit View',exact:true}).click(); await page.getByRole('slider',{name:'Auto Step speed',exact:true}).fill('8');")
cli('snapshot')
