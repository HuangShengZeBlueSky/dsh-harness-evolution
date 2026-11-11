"""OS environment: isolated task containers, native task setup/grading and 800-character observations."""
import ast,asyncio,base64,glob,json,logging,os,random,re,select,subprocess,time,uuid
from pathlib import Path
from typing import List,Tuple
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parent
# Use the released task's unmodified fixture loader and strict grading functions.
source=ast.parse((ROOT/'source/task.py').read_text())
judge=next(n for n in source.body if isinstance(n,ast.ClassDef) and n.name=='JudgeConfig')
task=next(n for n in source.body if isinstance(n,ast.ClassDef) and n.name=='OSInteraction')
methods=[n for n in task.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in ['_load_configs','_evaluate_by_match','_evaluate_by_check_scripts']]
fixture=ast.ClassDef(name='NativeFixture',bases=[],keywords=[],body=methods,decorator_list=[])
exec(compile(ast.fix_missing_locations(ast.Module(body=[source.body[0],judge,fixture],type_ignores=[])),str(ROOT/'source/task.py'),'exec'))
loader=NativeFixture()

class Environment:
    def __init__(self,config):
        self.config=config;self.container=None;self.shell=None;self.buffer=b'';self.step_number=0
        self.docker=['docker','--host',config['docker_host']]
    def reset(self,task_id,seed,split):
        fixture=json.loads((ROOT/'fixtures'/f'{task_id}.json').read_text());self.fixture=SimpleNamespace(**fixture)
        self.container='osevo-'+uuid.uuid4().hex
        args=self.docker+['run','-d','--name',self.container,'--label','owner=os-evolution-20261023','--log-driver','none','--workdir','/root','--memory','1g','--memory-swap','1g','--entrypoint','/bin/sleep','os-evolve/'+self.fixture.image,'infinity']
        subprocess.run(args,check=True,capture_output=True,timeout=90)
        for script in self.fixture.init_script or []:
            code,out,err=self.independent(script)
            if code:raise RuntimeError('Native init script failed: '+err.decode(errors='replace')[-400:])
        self.shell=subprocess.Popen(self.docker+['exec','-i',self.container,'bash','--noprofile','--norc'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,bufsize=0)
        if self.fixture.start:self.execute(self.fixture.start[1])
        return {'system_prompt':(ROOT/'system-prompt.txt').read_text(),'observation':'Now, I will start a new problem in a new OS. My problem is:\n\n'+self.fixture.description,'tools':json.loads((ROOT/'tools.json').read_text())}
    def execute(self,script):
        if not isinstance(script,str):return ''
        marker='__OSEVO_END_'+uuid.uuid4().hex+'__'
        encoded=base64.b64encode(script.encode()).decode()
        command='eval "$(printf %s '+encoded+' | base64 -d)"\nprintf "\\n'+marker+'\\n"\n'
        self.shell.stdin.write(command.encode());self.shell.stdin.flush()
        deadline=time.monotonic()+30
        while marker.encode() not in self.buffer:
            left=deadline-time.monotonic()
            if left<=0:raise TimeoutError('OS shell command exceeded native 30 second timeout')
            ready,_,_=select.select([self.shell.stdout],[],[],left)
            if not ready:continue
            chunk=os.read(self.shell.stdout.fileno(),65536)
            if not chunk:raise RuntimeError('OS shell session ended before command completion')
            self.buffer+=chunk
        output,self.buffer=self.buffer.split(marker.encode(),1);self.buffer=self.buffer.lstrip(b'\r\n')
        output=output.rstrip(b'\n')
        output=re.sub(b'\x1b\\[[0-9;]*[a-zA-Z]',b'',output).replace(b'\x07',b'')
        return output.decode('utf-8',errors='replace')
    def independent(self,script,*params):
        language,code=script
        if language=='bash':args=['bash','-c',code]+(['--',*params] if params else [])
        elif language=='python':args=['python3','-c',code,*params]
        elif language in ('c','c++'):
            suffix='cpp' if language=='c++' else 'c';compiler='g++' if language=='c++' else 'gcc';target='/tmp/osevo-check.'+suffix
            put=subprocess.run(self.docker+['exec','-i',self.container,'bash','-c','cat > '+target],input=code.encode(),capture_output=True,timeout=30)
            built=subprocess.run(self.docker+['exec',self.container,compiler,target,'-o','/tmp/osevo-check'],capture_output=True,timeout=30)
            if built.returncode:return built.returncode,built.stdout,built.stderr
            args=['/tmp/osevo-check',*params]
        else:raise ValueError('Unsupported native script language '+language)
        p=subprocess.run(self.docker+['exec',self.container,*args],capture_output=True,timeout=30)
        return p.returncode,p.stdout,p.stderr
    async def execute_independent(self,script,*params):return self.independent(script,*params)
    def grade(self,answer):
        cfg=self.fixture
        if isinstance(answer,str) and cfg.match and cfg.match['strip']:answer=answer.strip()
        if cfg.match:return loader._evaluate_by_match(answer,cfg)
        if cfg.check:return asyncio.run(loader._evaluate_by_check_scripts(answer,cfg,self))
        raise RuntimeError('Native task has no grading rule')
    def step(self,name,arguments):
        self.step_number+=1
        if name in ['answer_action','finish_action']:
            answer=arguments.get('answer',next(iter(arguments.values()),None));score=float(self.grade(answer))
            return {'observation':'Task submitted.','score':score,'done':True,'error':False}
        if name!='bash_action':return {'observation':'Invalid function call. Please call a tool instead','score':0,'done':False,'error':False}
        script=arguments.get('script',next(iter(arguments.values()),''))
        try:result=self.execute(script)
        except TimeoutError:
            return {'observation':'OS command timed out.','score':0,'done':True,'error':False}
        if len(result)>800:result=result[:780]+'\n[truncated because the output is too long]'
        return {'observation':'The output of the OS:\n\n'+result if result else 'The output of the OS is empty.','score':0,'done':False,'error':False}
    def close(self):
        if self.shell:
            self.shell.terminate()
            try:self.shell.wait(timeout=3)
            except subprocess.TimeoutExpired:self.shell.kill()
        if self.container:subprocess.run(self.docker+['rm','-f',self.container],capture_output=True,timeout=30)

def create_environment(config):return Environment(config)
