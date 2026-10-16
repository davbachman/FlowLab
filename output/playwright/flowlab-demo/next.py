from capture import *
code("await page.getByRole('button',{name:'Collapse output',exact:true}).click(); await page.getByRole('button',{name:'Fit View',exact:true}).click();")
record('02-debug',"""await page.getByRole('button',{name:'Add breakpoint on n > 0',exact:true}).click(); await page.getByRole('button',{name:'Run',exact:true}).click(); await page.waitForTimeout(1300); await page.getByRole('button',{name:'Step',exact:true}).click(); await page.waitForTimeout(900); await page.getByRole('button',{name:'Step',exact:true}).click(); await page.waitForTimeout(1100); await page.getByRole('button',{name:'Remove breakpoint on n > 0',exact:true}).click(); await page.getByRole('button',{name:'Auto Step',exact:true}).click(); await page.waitForTimeout(4900);""")
example('List Statistics')
code("if(await page.getByRole('button',{name:'Collapse output',exact:true}).isVisible()) await page.getByRole('button',{name:'Collapse output',exact:true}).click(); await page.getByRole('button',{name:'Fit View',exact:true}).click(); await page.getByRole('slider',{name:'Auto Step speed',exact:true}).fill('8');")
cli('snapshot')
