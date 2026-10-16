from capture import *
record('05-input',"""await page.waitForTimeout(900); await page.getByRole('textbox',{name:'Input',exact:true}).pressSequentially('0.5',{delay:170}); await page.waitForTimeout(600); await page.getByRole('button',{name:'Submit',exact:true}).click(); await page.waitForTimeout(2300);""")
code("await page.getByRole('button',{name:'Imports',exact:true}).click(); await page.getByRole('textbox',{name:'Imports list',exact:true}).fill('math, text, image, turtle'); await page.locator('#flowlab-menu-trigger').click(); await page.getByRole('menuitem',{name:'Reference',exact:true}).click();")
cli('snapshot')
