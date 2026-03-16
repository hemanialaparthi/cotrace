// ===== TABS MODULE =====
// Handles tab switching between Chat, Contributions, and Changes views

// Initialize tab switching
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const targetId = e.currentTarget.dataset.target;
      switchTab(targetId, e.currentTarget);
    });
  });
}

// Switch to a specific tab
function switchTab(targetId, tabElement) {
  const tabs = document.querySelectorAll('.tab');
  const views = document.querySelectorAll('.view');
  
  // Update tab active state
  tabs.forEach(tab => tab.classList.remove('active'));
  if (tabElement) {
    tabElement.classList.add('active');
  }

  // Update view visibility
  views.forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(targetId);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Handle tab-specific actions
  if (targetId === 'view-contribution') {
    handleContributionsTab();
  } else if (targetId === 'view-changes') {
    handleChangesTab();
  }
}

// Handle changes tab activation
function handleChangesTab() {
  console.log('[CHANGES] Changes tab activated');
  initChangesTab();
}
