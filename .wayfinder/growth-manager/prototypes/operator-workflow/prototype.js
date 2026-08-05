// PROTOTYPE: three structurally different operator workflows, switchable via ?variant=.
const icons = {
  grid: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  campaign: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m5 7H2"/></svg>',
  agents: '<svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M16 5a4 4 0 0 1 0 7m2 3c2.4.8 4 3 4 6"/></svg>',
  approval: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  chevron: '<svg class="icon" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  refresh: '<svg class="icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0 2 5.5M20 4v7h-7"/></svg>',
  send: '<svg class="icon" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
};

const variants = {
  A: 'Command Center',
  B: 'Agent Workspaces',
  C: 'Project Portfolio',
};

let currentScreen = 'overview';

function topbar(projectLabel = 'Nuances') {
  return `<header class="topbar">
    <div class="brand"><div class="brand-mark">DM</div>Distribution Manager</div>
    <button class="project-select" aria-label="Switch project">${projectLabel}<span aria-hidden="true">⌄</span></button>
    <div class="top-spacer"></div>
    <div class="sync"><span class="dot"></span>Control plane healthy</div>
    <button class="avatar" aria-label="Operator profile">OP</button>
  </header>`;
}

function sidebar() {
  const items = [
    ['overview','Overview',icons.grid,''],
    ['campaign','Campaign detail',icons.campaign,''],
    ['agents','Agent workspace',icons.agents,'2'],
    ['approvals','Approval center',icons.approval,'5'],
  ];
  return `<nav class="sidebar" aria-label="Primary navigation">
    <div class="nav-title">Operate</div>
    ${items.map(([id,label,icon,badge]) => `<button class="nav-button ${currentScreen===id?'active':''}" data-screen="${id}">${icon}<span>${label}</span>${badge?`<span class="badge">${badge}</span>`:''}</button>`).join('')}
    <div class="nav-title">Projects</div>
    <button class="nav-button"><span class="dot"></span><span>Nuances</span></button>
    <button class="nav-button"><span class="dot amber"></span><span>BandAce</span></button>
  </nav>`;
}

function metric(label, value, delta, warn = false) {
  return `<div class="metric"><div class="metric-label"><span>${label}</span><span class="delta ${warn?'warn':''}">${delta}</span></div><div class="metric-value">${value}</div></div>`;
}

function overviewContent() {
  return `<div class="page-head"><div><div class="eyebrow">Nuances · 7 day window</div><h1>Growth command center</h1><p class="subtle">What needs you, what is working, and how long the content queue will last.</p></div><button class="button primary">${icons.refresh} Run weekly analysis</button></div>
  <section class="metrics" aria-label="Key outcomes">
    ${metric('Paying Users','18','+28%')}${metric('First Launches','624','+11%')}${metric('Source Clicks','2,841','+17%')}${metric('Queue Coverage','2.4 days','Below 3d',true)}
  </section>
  <div class="grid-2">
    <section class="panel"><div class="panel-head"><h2>Active campaigns</h2><div class="tabs"><button class="tab active">7d</button><button class="tab">30d</button><button class="tab">Life</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Campaign</th><th>Agent</th><th>Status</th><th>Queue</th><th>Paying</th><th>Decision</th></tr></thead><tbody>
        <tr><td><strong>Everyday English Reels</strong></td><td>Instagram Content</td><td><span class="status"><i class="dot"></i>Active</span></td><td><div class="coverage"><div class="coverage-bar warn"><span style="width:38%"></span></div>2.4d</div></td><td>12</td><td><strong>Scale</strong></td></tr>
        <tr><td><strong>Comment “IOS”</strong></td><td>Instagram Content</td><td><span class="status"><i class="dot amber"></i>Needs you</span></td><td><div class="coverage"><div class="coverage-bar"><span style="width:90%"></span></div>7.2d</div></td><td>4</td><td><strong>Approve</strong></td></tr>
        <tr><td><strong>Group Vocabulary Hooks</strong></td><td>Facebook Groups</td><td><span class="status"><i class="dot red"></i>Blocked</span></td><td><div class="coverage"><div class="coverage-bar bad"><span style="width:9%"></span></div>0.6d</div></td><td>2</td><td><strong>Observe</strong></td></tr>
      </tbody></table></div>
    </section>
    <section class="panel"><div class="panel-head"><h2>Outcome trend</h2><button class="button ghost">View data</button></div><div class="chart" aria-label="Paying Users bar chart"><div class="bar" style="height:22%"><span>M</span></div><div class="bar" style="height:34%"><span>T</span></div><div class="bar" style="height:28%"><span>W</span></div><div class="bar" style="height:56%"><span>T</span></div><div class="bar" style="height:72%"><span>F</span></div><div class="bar" style="height:65%"><span>S</span></div><div class="bar" style="height:86%"><span>S</span></div></div><div class="legend"><span class="status"><i class="dot"></i>Paying Users</span><span>18 total · Apple data pending</span></div></section>
  </div>`;
}

function campaignContent() {
  return `<div class="detail-hero"><div class="eyebrow" style="color:#c9d8ff">Instagram · Active</div><h1>Everyday English Reels</h1><p class="subtle">Owned by Instagram Content Agent · source links at Placement grain</p><div class="tabs"><button class="tab active">Performance</button><button class="tab">Content</button><button class="tab">Placements</button><button class="tab">Audit</button></div></div>
  <div class="metrics">${metric('Paying Users','12','Comparable')}${metric('First Launches','418','7d')}${metric('Views','84.2K','Fresh')}${metric('Queue Coverage','2.4 days','Warning',true)}</div>
  <div class="screen-placeholder"><section class="panel"><div class="panel-head"><h2>Placement performance</h2><button class="button">Metric comparability</button></div><div class="table-wrap"><table><thead><tr><th>Placement</th><th>State</th><th>Clicks</th><th>Launches</th><th>Paying</th></tr></thead><tbody><tr><td>Reel · “Stop saying very good”</td><td><span class="status"><i class="dot"></i>Fresh</span></td><td>1,221</td><td>188</td><td>7</td></tr><tr><td>Reel · “Three natural replies”</td><td><span class="status"><i class="dot amber"></i>Apple pending</span></td><td>806</td><td>142</td><td>4</td></tr><tr><td>Carousel · Weekend phrases</td><td><span class="status"><i class="dot"></i>Fresh</span></td><td>302</td><td>88</td><td>1</td></tr></tbody></table></div></section>
  <section class="panel"><div class="panel-head"><h2>Campaign timeline</h2></div><div class="timeline"><div class="timeline-item"><small>10:42</small><div class="timeline-line"></div><div><h3>Snapshot refreshed</h3><p class="subtle">Instagram insights · 7 metrics</p></div></div><div class="timeline-item"><small>09:30</small><div class="timeline-line"></div><div><h3>Manager chose scale</h3><p class="subtle">Paying Users lead comparable campaigns.</p></div></div><div class="timeline-item"><small>Yesterday</small><div class="timeline-line"></div><div><h3>3 posts approved</h3><p class="subtle">Exact versions locked for dispatch.</p></div></div></div></section></div>`;
}

function approvalsContent() {
  return `<div class="page-head"><div><div class="eyebrow">5 items need you</div><h1>Approval center</h1><p class="subtle">Review exact external actions. Changes invalidate previous approval.</p></div><button class="button primary">Approve selected</button></div>
  <section class="panel"><div class="panel-head"><h2>This week’s batch</h2><div class="tabs"><button class="tab active">All 5</button><button class="tab">Posts 4</button><button class="tab">DM policy 1</button></div></div><div class="table-wrap"><table><thead><tr><th></th><th>Action</th><th>Campaign</th><th>Schedule / expiry</th><th>Version</th><th>Risk</th></tr></thead><tbody>
    <tr><td><input type="checkbox" aria-label="Select Instagram Reel" checked></td><td><strong>Publish Instagram Reel</strong></td><td>Everyday English</td><td>Mon 18:30</td><td>9f2a…81d</td><td><span class="status"><i class="dot"></i>Standard</span></td></tr>
    <tr><td><input type="checkbox" aria-label="Select Threads post" checked></td><td><strong>Publish Threads post</strong></td><td>Daily corrections</td><td>Tue 12:15</td><td>ed10…0a2</td><td><span class="status"><i class="dot"></i>Standard</span></td></tr>
    <tr><td><input type="checkbox" aria-label="Select DM policy"></td><td><strong>Activate keyword DM policy</strong></td><td>Comment “IOS”</td><td>30 days</td><td>6c1e…a90</td><td><span class="status"><i class="dot amber"></i>Review limit</span></td></tr>
  </tbody></table></div></section>`;
}

function agentContent() {
  return `<div class="page-head"><div><div class="eyebrow">Instagram Content Agent</div><h1>Agent workspace</h1><p class="subtle">Campaign-scoped conversation and durable work state.</p></div><button class="button danger">Pause agent</button></div><div class="screen-placeholder"><section class="panel" style="min-height:520px"><div class="panel-head"><h2>Conversation · Everyday English Reels</h2><span class="status"><i class="dot"></i>Running</span></div><div class="messages"><div class="message"><div class="message-meta">Agent · 10:42</div>The 7-day snapshot favors short correction hooks. I prepared three variants and need approval for Monday.</div><div class="message manager"><div class="message-meta">You · 10:44</div>Keep the first hook under six words and use the real app demo at the end.</div><div class="message"><div class="message-meta">Agent · 10:45</div>Updated. The exact versions are now in Approval Center; prior approvals were invalidated.</div></div><div class="composer"><input aria-label="Message Instagram Content Agent" placeholder="Message this agent…"><button class="button primary" aria-label="Send message">${icons.send}</button></div></section><section class="panel"><div class="panel-head"><h2>Working state</h2></div><div style="padding:16px"><div class="key-value"><span>Task</span><strong>Create weekly variants</strong></div><div class="key-value"><span>Status</span><strong>waiting_for_you</strong></div><div class="key-value"><span>Context used</span><strong>62%</strong></div><div class="key-value"><span>Active campaigns</span><strong>2 / 3</strong></div><div class="key-value"><span>Queue coverage</span><strong style="color:var(--amber)">2.4 days</strong></div></div></section></div>`;
}

function screenContent() {
  if (currentScreen === 'campaign') return campaignContent();
  if (currentScreen === 'agents') return agentContent();
  if (currentScreen === 'approvals') return approvalsContent();
  return overviewContent();
}

function rightRail() {
  return `<aside class="right-rail" aria-label="Needs attention"><div class="eyebrow">Needs attention</div><h2>3 actions</h2><div class="attention red"><h3>Facebook observation blocked</h3><p>Browser session expired before the 24-hour screenshot.</p><button class="button">Reconnect session</button></div><div class="attention"><h3>Queue below 3 days</h3><p>Instagram coverage is 2.4 days. Three drafts are ready.</p><button class="button">Review drafts</button></div><div class="nav-title">Agent activity</div><div class="list"><div class="list-item"><strong>Threads Engagement</strong><p>Published at 11:30 · provider ID saved</p></div><div class="list-item"><strong>Growth Manager</strong><p>Weekly comparison completed · 2 exclusions</p></div></div></aside>`;
}

function variantA() {
  return `<div class="shell">${topbar()}<div class="layout-a">${sidebar()}<main id="main" class="main">${screenContent()}</main>${rightRail()}</div></div>`;
}

function variantB() {
  return `<div class="shell">${topbar('All projects')}<div class="workspace-b"><div class="queue-ribbon"><div class="queue-cell"><span>Nuances queue</span><strong style="color:var(--amber)">2.4 days · low</strong></div><div class="queue-cell"><span>BandAce queue</span><strong style="color:var(--green)">8.1 days · healthy</strong></div><div class="queue-cell"><span>Needs you</span><strong style="color:var(--amber)">5 approvals</strong></div></div>
  <div class="tabs" style="margin:12px 16px"><button class="tab active">Workspace</button><button class="tab">Campaigns</button><button class="tab">Approvals</button><button class="tab">Portfolio</button></div>
  <main id="main" class="tri-pane"><aside class="agent-list"><div class="eyebrow">Chain of command</div><button class="agent-card active"><div class="agent-name"><span class="agent-monogram">GM</span>Growth Manager</div><p class="subtle">2 questions · analyzing</p></button><button class="agent-card"><div class="agent-name"><span class="agent-monogram">IG</span>Instagram Content</div><p class="subtle">waiting_for_you · 2 campaigns</p></button><button class="agent-card"><div class="agent-name"><span class="agent-monogram">TH</span>Threads Engagement</div><p class="subtle">running · 1 campaign</p></button><button class="agent-card"><div class="agent-name"><span class="agent-monogram">FB</span>Facebook Groups</div><p class="subtle">blocked · session expired</p></button></aside>
  <section class="chat"><div class="chat-head"><div><h2 style="margin:0">Growth Manager</h2><span class="subtle">All projects · weekly review</span></div><button class="button">View evidence</button></div><div class="messages"><div class="message"><div class="message-meta">Growth Manager · 10:38</div>Nuances gained 18 Paying Users in 7 days. Instagram contributed 12; BandAce has stronger First Launch growth, but its quota definition is not comparable.</div><div class="message manager"><div class="message-meta">You · 10:41</div>What needs me today?</div><div class="message"><div class="message-meta">Growth Manager · 10:42</div>Approve three Instagram posts, reconnect the Facebook observation browser, and decide whether to replenish the 2.4-day Nuances queue.</div><div class="message"><div class="message-meta">Instagram Content Agent via Manager</div>I prepared the three variants using your under-six-word hook rule.</div></div><div class="composer"><input aria-label="Message Growth Manager" placeholder="Ask your Growth Manager…"><button class="button primary">${icons.send} Send</button></div></section>
  <aside class="inspector"><div class="eyebrow">Current decision</div><h2>Replenish Nuances</h2><div class="inspector-section"><div class="key-value"><span>Coverage</span><strong style="color:var(--amber)">2.4 days</strong></div><div class="key-value"><span>Target</span><strong>7 days</strong></div><div class="key-value"><span>Ready drafts</span><strong>3</strong></div><div class="key-value"><span>Comparable Paying</span><strong>12</strong></div></div><div class="inspector-section"><h3>Why this is suggested</h3><p class="subtle">Instagram leads all comparable Nuances campaigns in Paying Users and first-launch conversion.</p></div><button class="button primary" style="width:100%;justify-content:center">Review weekly batch</button></aside></main></div></div>`;
}

function variantC() {
  return `<div class="shell">${topbar('Portfolio view')}<main id="main" class="portfolio-c"><div class="portfolio-toolbar"><div><div class="eyebrow" style="color:#79a3ff">Cross-project operations</div><h1>Distribution portfolio</h1><p class="subtle">Comparable outcomes, queue health, and the work waiting for you.</p></div><div class="tabs"><button class="tab active">Portfolio</button><button class="tab">Agents</button><button class="tab">Approvals <span class="badge">5</span></button></div></div>
  <section class="project-grid"><article class="project-card featured"><div class="project-card-head"><div><div class="eyebrow" style="color:#79a3ff">Project Workspace</div><h2 style="font-size:22px">Nuances</h2><span class="status"><i class="dot amber"></i>Queue needs attention</span></div><button class="button">Open workspace ${icons.chevron}</button></div><div class="dark-metrics"><div class="dark-metric"><small>Paying Users · 7d</small><strong>18</strong></div><div class="dark-metric"><small>First Launches</small><strong>624</strong></div><div class="dark-metric"><small>Source Clicks</small><strong>2,841</strong></div><div class="dark-metric"><small>Queue Coverage</small><strong style="color:#ffbf66">2.4d</strong></div></div><div class="swimlanes"><div class="lane"><span class="lane-label">Instagram Content</span><div class="lane-track"><i class="scheduled"></i><i class="scheduled"></i><i class="scheduled pending"></i><i class="scheduled empty"></i><i class="scheduled empty"></i><i class="scheduled empty"></i><i class="scheduled empty"></i></div></div><div class="lane"><span class="lane-label">Threads Engagement</span><div class="lane-track"><i class="scheduled"></i><i class="scheduled"></i><i class="scheduled"></i><i class="scheduled"></i><i class="scheduled pending"></i><i class="scheduled empty"></i><i class="scheduled empty"></i></div></div><div class="lane"><span class="lane-label">Facebook Groups</span><div class="lane-track"><i class="scheduled pending"></i><i class="scheduled empty"></i><i class="scheduled empty"></i><i class="scheduled empty"></i><i class="scheduled empty"></i><i class="scheduled empty"></i><i class="scheduled empty"></i></div></div></div></article>
  <article class="project-card"><div class="project-card-head"><div><div class="eyebrow" style="color:#79a3ff">Project Workspace</div><h2>BandAce</h2><span class="status"><i class="dot"></i>Healthy</span></div><button class="button ghost" style="color:white">Open ${icons.chevron}</button></div><div class="dark-metrics" style="grid-template-columns:repeat(2,1fr)"><div class="dark-metric"><small>Paying Users · 7d</small><strong>11</strong></div><div class="dark-metric"><small>Queue Coverage</small><strong style="color:#72d6a3">8.1d</strong></div></div></article>
  <article class="project-card"><div class="project-card-head"><div><div class="eyebrow" style="color:#79a3ff">Comparable metric</div><h2>Paying Users · 7 days</h2></div></div><div class="chart" style="background:#11192c;border:0;height:145px"><div class="bar" style="height:88%"><span style="color:#aab6cf">Nuances 18</span></div><div class="bar" style="height:54%;background:#7047b8"><span style="color:#aab6cf">BandAce 11</span></div></div></article></section>
  <section class="approval-drawer"><div class="dark-panel"><div class="panel-head" style="padding:0 0 12px;border-color:#2d3a55"><h2>Needs you now</h2><button class="button">Open all</button></div><div class="list"><div class="list-item" style="background:#202b41;border-color:#34415a;color:white"><strong>Approve Nuances weekly batch</strong><p style="color:#aab6cf">3 posts · exact versions locked</p></div><div class="list-item" style="background:#202b41;border-color:#34415a;color:white"><strong>Reconnect Facebook browser</strong><p style="color:#aab6cf">24-hour observation is 2h late</p></div></div></div><div class="dark-panel"><div class="panel-head" style="padding:0 0 12px;border-color:#2d3a55"><h2>Agent chain</h2></div><table class="dark-table"><tbody><tr><td>Growth Manager</td><td><span class="status"><i class="dot"></i>Analyzing</span></td></tr><tr><td>Instagram Content</td><td><span class="status"><i class="dot amber"></i>Needs you</span></td></tr><tr><td>Facebook Groups</td><td><span class="status"><i class="dot red"></i>Blocked</span></td></tr></tbody></table></div></section></main></div>`;
}

function switcher(variant) {
  return `<div class="switcher" aria-label="Prototype variant switcher"><button data-cycle="-1" aria-label="Previous variant">←</button><div class="switch-label">${variant} — ${variants[variant]}</div><button data-cycle="1" aria-label="Next variant">→</button></div><div class="prototype-flag">PROTOTYPE · NO REAL ACTIONS</div>`;
}

function currentVariant() {
  const key = new URLSearchParams(location.search).get('variant')?.toUpperCase();
  return variants[key] ? key : 'A';
}

function render() {
  const variant = currentVariant();
  const content = variant === 'B' ? variantB() : variant === 'C' ? variantC() : variantA();
  document.querySelector('#app').innerHTML = content + switcher(variant);
  document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => { currentScreen = button.dataset.screen; render(); }));
  document.querySelectorAll('[data-cycle]').forEach((button) => button.addEventListener('click', () => cycle(Number(button.dataset.cycle))));
}

function cycle(direction) {
  const keys = Object.keys(variants);
  const index = keys.indexOf(currentVariant());
  const next = keys[(index + direction + keys.length) % keys.length];
  const url = new URL(location.href);
  url.searchParams.set('variant', next);
  history.replaceState({}, '', url);
  render();
}

document.addEventListener('keydown', (event) => {
  const tag = document.activeElement?.tagName;
  if (['INPUT','TEXTAREA'].includes(tag) || document.activeElement?.isContentEditable) return;
  if (event.key === 'ArrowLeft') cycle(-1);
  if (event.key === 'ArrowRight') cycle(1);
});

render();
