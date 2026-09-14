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
.dbt-wrap{display:flex;flex-direction:column;gap:8px;padding:10px 12px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#333);border:1px solid var(--dsw-alias-border-l4,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);max-width:560px;}
.dbt-head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;}
.dbt-row{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;}
.dbt-note{font-size:12px;opacity:.8;}
.dbt-chip{display:inline-flex;align-items:center;gap:6px;}
.dbt-chip-btn{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;font-size:12px;line-height:18px;border:1px solid var(--dsw-alias-border-l4,#ddd);border-radius:8px;cursor:pointer;background:var(--dsw-alias-bg-base,#fafafa);color:var(--dsw-alias-label-primary,#333);}
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
      'div',
      { className: 'dbt-note' },
      '配置与发起都在对话里完成:',
    ),
    React.createElement(
      'ul',
      { className: 'dbt-note' },
      React.createElement('li', null, '查看/修改配置:对助手说"用 debate_config 看一下辩论配置",或直接说"正方用 GPT、反方用 Claude、裁决用 DeepSeek"——助手会写回 .debate/config.json 并长期复用。'),
      React.createElement('li', null, '发起辩论:说"按配置跑一场辩论,主题:……",助手会调用 run_debate,多轮收敛后返回草稿(draft)。'),
      React.createElement('li', null, '签认/驳回:草稿出现后,说"签认"或"驳回(理由)"——助手会调用 debate_sign;在签认前草稿不会被视为最终结论。'),
      React.createElement('li', null, '多供应商:至少需要 2 家已激活的 provider(建议 3 家 + 1 个廉价模型担任起草/摘要)。'),
    ),
  );
}

export function apply(ctx: any): void {
  const slots = ctx.slots;
  ensureCss();

  // Settings section entry.
  slots.inject('settings.section', () =>
    slots.register(
      { name: 'settings.section', id: 'dsh-debate', label: '多智能体辩论', order: 90 },
      () => React.createElement(Panel),
    ),
  );

  // Composer dock capsule.
  slots.inject('conversation.composer.dock', () =>
    slots.register(
      { name: 'conversation.composer.dock', id: 'dsh-debate', order: 100, label: '多智能体辩论' },
      () => React.createElement(Panel),
    ),
  );
}
