"""Method-level diagrams, distinct from each artifact's runtime architecture."""
def create(root,r):
 a=root/r['artifact'];d=r['benchmark'];source=r.get('source_experiment','')
 final=r.get('campaign_final_checkpoint',r['checkpoint'])
 if d=='telecom':
  steps=('Repaired Luna-derived starting checkpoint v02','Diagnose training trajectories and existing native surfaces','Revise native plugins and their composition','Paired training evaluation: 74 tasks x 3','Training success improves','Record historical per-version tests: 40 tasks x 3')
  steps_zh=('Luna修复起点v02','分析训练轨迹及已有原生组件','修改原生插件与装配','配对训练评测：74题乘3遍','训练成功率提升','记录历史逐版测试：40题乘3遍')
 elif 'original-best' in source:
  steps=('Old method-1 final checkpoint v37','Diagnose visible search and option-selection failures','Cooperative edits to two or more effective plugins','Parent vs candidate on the same 50 training tasks','Mean reward improves and edits take effect','Freeze the training-selected final checkpoint '+final)
  steps_zh=('旧方法1最终版v37','分析检索与规格选择失败','至少两个插件产生有效协同修改','父版与候选使用同批50道训练题','平均奖励提升且改动真实生效','冻结训练选定最终版'+final)
 elif r['method'].startswith('L5'):
  task='40 training tasks plus 60 validation tasks' if d=='webshop' else '83 training tasks plus 17 held-out family tasks'
  gate='Training strict success improves; validation strict success does not fall' if d=='webshop' else 'Train improves; validation and family macro score do not fall'
  steps=('H0: no enhancement plugins','Map current capabilities and problem classes','Implement focused native plugins',task,gate,'Freeze the training-selected final checkpoint '+final)
  steps_zh=('H0零增强插件','梳理当前能力与问题类别','实现专职原生插件','40道训练题及60道验证题' if d=='webshop' else '83道训练题及17道任务族留出验证','训练严格成功提升且验证严格成功不降' if d=='webshop' else '训练提升且验证均值和类别宏平均不降','冻结训练选定最终版'+final)
 elif r['method'].startswith('L4'):
  steps=('H0: no enhancement plugins','Maintain agent structure and plugin responsibility map','Propose a problem-class repair, then implement plugins','Same 50-task training batch' if d=='dbbench' else '80 training tasks plus 20 validation tasks','Training improves and change takes effect' if d=='dbbench' else 'Train improves; validation does not fall; change takes effect','Freeze the training-selected final checkpoint '+final)
  steps_zh=('H0零增强插件','维护Agent结构和插件职责图','先提出问题类修复方案，再实现插件','同批50道训练题' if d=='dbbench' else '80道训练题及20道验证题','训练提升且改动真实生效' if d=='dbbench' else '训练提升、验证不降、改动真实生效','冻结训练选定最终版'+final)
 else:
  steps=('H0: no enhancement plugins','Diagnose training failures and current capabilities','Freely design and compose native plugins','Same 50-task parent and candidate evaluation','Training improves and change takes effect','Freeze training-selected final checkpoint '+final)
  steps_zh=('H0零增强插件','诊断训练失败与当前能力','自主设计并组合原生插件','同批50题父版与候选评测','训练提升且改动真实生效','冻结训练选定最终版'+final)
 for zh,labels in [(False,steps),(True,steps_zh)]:
  l=['flowchart TD']+[f'    {node}["{label}"]' for node,label in zip('ABCDEF',labels)]
  l+=['    A --> B','    B --> C','    C --> D','    D --> E','    E -->|'+('采用或拒绝后继续' if zh else 'Adopt or reject; continue')+'| B','    E -->|'+('预算结束' if zh else 'Budget ends')+'| F']
  if d!='telecom':l+=['    F --> T["'+('最终版测试' if zh else 'Final-checkpoint test')+'"]']
  l+=['    E --> K["'+('已晋升检查点归档' if zh else 'Archive promoted checkpoints')+'"]','    K -.-> R["'+('独立回溯补测：不回传优化器' if zh else 'Independent retrospective tests; no optimizer feedback')+'"]']
  node='R' if r.get('selection_kind')=='retrospective_adopted' else 'F' if d=='telecom' else 'T'
  l += [f'    {node} --> P["'+('本次发布 ' if zh else 'This release: ')+r['checkpoint']+'"]','    classDef release fill:#e3f5ef,stroke:#0c7968,color:#145b4b','    class P release']
  (a/('method.zh-CN.mmd' if zh else 'method.mmd')).write_text('\n'.join(l)+'\n')
