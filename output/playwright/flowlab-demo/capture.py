import os, subprocess, sys
ROOT=os.path.dirname(os.path.abspath(__file__))
ENV={**os.environ,'PWTEST_DAEMON_SESSION_DIR':'/private/tmp/flowlab-pw-daemon','npm_config_cache':'/private/tmp/flowlab-npm-cache'}
def cli(*args):
 p=subprocess.run(['/Users/davidbachman/.codex/skills/playwright/scripts/playwright_cli.sh','-s=flowlab-demo',*args],env=ENV,text=True,capture_output=True)
 print(p.stdout,flush=True)
 if p.returncode or '### Error' in p.stdout: raise RuntimeError(p.stderr or p.stdout)
 return p.stdout
def code(js):return cli('run-code','async (page) => {'+js+'}')
def record(name,js):
 cli('video-start',ROOT+'/'+name+'.webm','--size','1600x800','--fps','30','--cursor')
 code(js)
 cli('video-stop')
def example(name):
 code("await page.getByRole('button',{name:'Examples',exact:true}).click(); await page.getByRole('menuitem',{name:"+repr(name)+",exact:true}).click(); await page.getByRole('button',{name:'Fit View',exact:true}).click();")
if __name__=='__main__':
 record('01-edit',"""await page.waitForTimeout(700); await page.getByRole('textbox',{name:'Process text',exact:true}).fill('width <- 12\\nheight <- 5\\narea <- width * height\\nlabel <- "Area: " + area'); await page.getByRole('button',{name:'Step',exact:true}).click(); await page.waitForTimeout(900); await page.getByRole('button',{name:'Step',exact:true}).click(); await page.waitForTimeout(1200); await page.getByRole('button',{name:'Run',exact:true}).click(); await page.waitForTimeout(2400);""")
 example('Basic')
 cli('snapshot')
