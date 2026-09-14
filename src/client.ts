// Browser half of dsh-debate, in the format DSH's web shell consumes:
// built to CJS by tsdown and wrapped in `window.__ModuleLoader__.load(...)`
// by `scripts/wrap-client.mjs`.
//
// The panel is intentionally static: configuration is read and written by the
// Host-side `debate_config` / `run_debate` tools (say it in chat), and the
// human sign-off is issued through `debate_sign`. A richer interactive panel
// needs the api-remotes Remote seam and lands in a later version.
import * as React from 'react';

export const name = 'dsh-debate-client';

export const inject = ['slots'];

const CSS = `
.dbt-wrap{display:flex;flex-direction:column;gap:6px;padding:8px 10px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary,#333);border:1px solid var(--dsw-alias-border-l4,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);max-width:560px;}
.dbt-head{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;}
.dbt-notes{margin:0;padding-left:16px;font-size:11.5px;opacity:.85;max-height:150px;overflow-y:auto;}
.dbt-notes li{margin:2px 0;}
.dbt-chip{display:inline-flex;flex-direction:column;align-items:flex-start;gap:4px;max-width:340px;}
.dbt-chip-btn{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;font-size:11.5px;line-height:18px;border:1px solid var(--dsw-alias-border-l4,#ddd);border-radius:8px;cursor:pointer;background:var(--dsw-alias-bg-base,#fafafa);color:var(--dsw-alias-label-primary,#333);}
.dbt-chip-btn:hover{border-color:var(--dsw-alias-state-business-primary,#2f81f7);}
`;

function ensureCss(): void {
  const tagId = 'dsh-debate-panel';
  if (typeof document === 'undefined') return;
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = tagId;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

function Panel(): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'dbt-wrap' },
    React.createElement('div', { className: 'dbt-head' }, '多智能体辩论'),
    React.createElement(
      'ul',
      { className: 'dbt-notes' },
      React.createElement('li', null, '查看/修改配置:对助手说"看一下辩论配置",或直接说"正方用 A 模型、反方用 B 模型、裁决用 C 模型"——助手调用 debate_config 写回 .debate/config.json 并长期复用。'),
      React.createElement('li', null, '发起辩论:说"按配置跑一场辩论,主题:……"→ 助手调用 run_debate,多轮收敛后返回草稿(draft)。'),
      React.createElement('li', null, '签认/驳回:草稿出现后说"签认"或"驳回(理由)"→ 助手调用 debate_sign;签认前草稿不算最终结论。'),
      React.createElement('li', null, '角色路由 = 网关 provider + 模型 model(如 provider=opencode-go、model=glm-5.3),不能把厂商名当 provider。'),
      React.createElement('li', null, '至少 2 个不同模型(同一网关下的两家厂商也算;同一厂商的 flash/pro 属同门、增益有限,自行把握)。'),
    ),
  );
}

/** One-line capsule for the composer dock; expands to the notes on demand. */
function Capsule(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return React.createElement(
      'div',
      { className: 'dbt-chip' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dbt-chip-btn',
          title: '展开多智能体辩论说明',
          onClick: () => setOpen(true),
        },
        '⚙ 多智能体辩论',
      ),
    );
  }
  return React.createElement(
    'div',
    { className: 'dbt-chip' },
    React.createElement(Panel),
    React.createElement(
      'button',
      { type: 'button', className: 'dbt-chip-btn', onClick: () => setOpen(false) },
      '收起',
    ),
  );
}

export function apply(ctx: any): void {
  const slots = ctx.slots;
  ensureCss();

  // Settings section: the full notes live here.
  slots.inject('settings.section', () =>
    slots.register(
      { name: 'settings.section', id: 'dsh-debate', label: '多智能体辩论', order: 90 },
      () => React.createElement(Panel),
    ),
  );

  // Composer dock: one compact capsule that expands on click.
  slots.inject('conversation.composer.dock', () =>
    slots.register(
      { name: 'conversation.composer.dock', id: 'dsh-debate', order: 100, label: '多智能体辩论' },
      () => React.createElement(Capsule),
    ),
  );
}
