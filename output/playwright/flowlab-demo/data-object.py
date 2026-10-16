from capture import *
record('03-data',"""await page.getByRole('button',{name:'Auto Step',exact:true}).click(); await page.waitForTimeout(5800);""")
example('Object')
code("if(await page.getByRole('button',{name:'Collapse output',exact:true}).isVisible()) await page.getByRole('button',{name:'Collapse output',exact:true}).click(); await page.getByRole('button',{name:'Fit View',exact:true}).click(); await page.getByRole('slider',{name:'Auto Step speed',exact:true}).fill('4');")
record('04-objects',"""await page.getByRole('button',{name:'Auto Step',exact:true}).click(); await page.waitForTimeout(6800);""")
example('Number Guess')
code("if(await page.getByRole('button',{name:'Collapse output',exact:true}).isVisible()) await page.getByRole('button',{name:'Collapse output',exact:true}).click(); await page.getByRole('button',{name:'Fit View',exact:true}).click(); await page.getByRole('button',{name:'Run',exact:true}).click();")
cli('snapshot')
