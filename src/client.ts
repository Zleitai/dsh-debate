// Client half of dsh-debate: the settings config panel, the composer-dock
// capsule, and the run-card with the human sign-off control.
//
// This module is exported from the package's `./client` entry and mounted on
// the host web plane. It registers UI through the `slots` service and talks
// to the Host half through package-private JSON RPC (the `host` builtin state).
//
// NOTE: the Host half must expose the matching package-private methods
// `debate:get-config`, `debate:set-config`, `debate:run`, and `debate:sign`
// via the deployment's remote/RPC seam.

/* eslint-disable */
// Client globals are provided by the web plane (React, slots, styles, host).
// Declared loosely here so this module typechecks without importing the full
// client-UI package graph; the runtime values are real services.
declare const React: any;
declare const styles: { insert: (css: string) => () => void };
declare const host: { call: (method: string, args?: any) => Promise<any> };

interface Slots {
  inject(slot: string, register: () => unknown): unknown;
  register(contract: unknown, render: (props: any) => unknown): unknown;
}

export const name = 'dsh-debate-client';

export const inject = ['slots'];

export function apply(ctx: any): void {
  const slots = ctx.get('slots') as Slots | undefined;
  if (slots === undefined) {
    console.error('dsh-debate: client `slots` service unavailable');
    return;
  }

  ctx.effect(() => styles.insert(`
.dbt-wrap{display:flex;flex-direction:column;gap:8px;padding:10px 12px;font-size:13px;line-height:1.5;color:var(--text-color,#333);border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--bg-color,#fff);max-width:560px;}
.dbt-head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;}
.dbt-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dbt-label{font-size:12px;opacity:.75;min-width:72px;}
.dbt-chip{display:inline-flex;align-items:center;gap:6px;}
.dbt-chip-btn{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;font-size:12px;line-height:18px;border:1px solid var(--border-color,#ddd);border-radius:8px;cursor:pointer;background:var(--bg-color,#fafafa);color:var(--text-color,#333);}
.dbt-btn{padding:5px 14px;font-size:12px;border:none;border-radius:7px;background:#2f81f7;color:#fff;cursor:pointer;}
.dbt-btn.dbt-danger{background:#d93838;}
.dbt-ok{font-size:11px;color:#1a7f37;}
.dbt-list{font-size:12px;opacity:.8;}
`));

  const MODES = [
    { id: 'quick', name: '快速' },
    { id: 'standard', name: '标准' },
    { id: 'deep', name: '深度' },
  ];
  const ROLES = [
    { id: 'proposer', name: '正方' },
    { id: 'opponent', name: '反方' },
    { id: 'adjudicator', name: '裁决' },
    { id: 'reviewer', name: '复核' },
    { id: 'drafter', name: '起草' },
    { id: 'cheap', name: '廉价' },
  ];

  function Panel() {
    const [data, setData] = React.useState(null);
    const [rounds, setRounds] = React.useState(3);
    const [roles, setRoles] = React.useState([]);
    const [notice, setNotice] = React.useState('');
    React.useEffect(() => {
      host.call('debate:get-config', {}).then((res: any) => {
        setData(res);
        if (res && typeof res.maxRounds === 'number') setRounds(res.maxRounds);
        if (res && Array.isArray(res.roles)) setRoles(res.roles);
      }).catch((e: any) => setNotice('读取配置失败:' + String(e?.message ?? e)));
    }, []);
    const setRoleProvider = (role: string, provider: string) => {
      setRoles((prev: any[]) => {
        const others = prev.filter((r) => r.role !== role);
        return others.concat({ role, route: { provider } });
      });
    };
    const save = () => {
      host.call('debate:set-config', { maxRounds: rounds, roles }).then(() => {
        setNotice('已保存');
      }).catch((e: any) => setNotice('保存失败:' + String(e?.message ?? e)));
    };
    const run = () => {
      const topic = (document as any)?.querySelector?.('#dbt-topic')?.value ?? '';
      host.call('debate:run', { topic, rounds }).then((res: any) => {
        setNotice('已发起辩论:' + JSON.stringify(res));
      }).catch((e: any) => setNotice('发起失败:' + String(e?.message ?? e)));
    };

    return React.createElement('div', { className: 'dbt-wrap' },
      React.createElement('div', { className: 'dbt-head' }, '多智能体辩论 · 配置'),
      React.createElement('div', { className: 'dbt-row' },
        React.createElement('span', { className: 'dbt-label' }, '讨论轮数'),
        React.createElement('input', {
          type: 'number', min: 1, max: 10, value: rounds,
          onChange: (e: any) => setRounds(Number(e.target.value)),
        }),
      ),
      ROLES.map((r) => React.createElement('div', { className: 'dbt-row', key: r.id },
        React.createElement('span', { className: 'dbt-label' }, r.name),
        React.createElement('input', {
          type: 'text',
          placeholder: 'provider id',
          value: (roles.find((x: any) => x.role === r.id)?.route?.provider) ?? '',
          onChange: (e: any) => setRoleProvider(r.id, e.target.value),
        }),
      )),
      React.createElement('div', { className: 'dbt-row' },
        React.createElement('span', { className: 'dbt-label' }, '主题'),
        React.createElement('input', { type: 'text', id: 'dbt-topic', placeholder: '辩论命题' }),
      ),
      React.createElement('div', { className: 'dbt-row' },
        React.createElement('button', { type: 'button', className: 'dbt-btn', onClick: save }, '保存配置'),
        React.createElement('button', { type: 'button', className: 'dbt-btn', onClick: run }, '发起辩论'),
        notice ? React.createElement('span', { className: 'dbt-ok' }, notice) : null,
      ),
    );
  }

  // Config capsule + settings section (same panel, two entry points).
  slots.inject('settings.section', () => slots.register(
    { name: 'settings.section', id: 'dsh-debate', label: '多智能体辩论', order: 90 },
    () => React.createElement(Panel),
  ));
  slots.inject('conversation.composer.dock', () => slots.register(
    { name: 'conversation.composer.dock', id: 'dsh-debate', order: 100, label: '多智能体辩论' },
    () => React.createElement(Panel),
  ));

  // Run-card view: shows the latest run's sign-off state and the sign button.
  function SignOffCard(props: any) {
    const [state, setState] = React.useState(props?.value ?? {});
    React.useEffect(() => { setState(props?.value ?? {}); }, [props?.value]);
    const sign = () => host.call('debate:sign', { decision: 'sign' }).then((res: any) => setState(res));
    const reject = () => host.call('debate:sign', { decision: 'reject' }).then((res: any) => setState(res));
    return React.createElement('div', { className: 'dbt-wrap' },
      React.createElement('div', { className: 'dbt-head' }, '辩论结果 · ' + String(state?.signOff ?? '')),
      React.createElement('div', { className: 'dbt-list' }, String(state?.verdict ?? '')),
      React.createElement('div', { className: 'dbt-row' },
        React.createElement('button', { type: 'button', className: 'dbt-btn', onClick: sign }, '签认'),
        React.createElement('button', { type: 'button', className: 'dbt-btn dbt-danger', onClick: reject }, '驳回'),
      ),
    );
  }
  slots.inject('tool.view.cordis', () => slots.register(
    { name: 'tool.view.cordis', key: 'self' },
    (props: any) => React.createElement(SignOffCard, props),
  ));
}
