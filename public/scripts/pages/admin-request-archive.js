let requestSelectionMode = false;
let requestArchivePending = false;
const selectedRequestIds = new Set();
let selectableRequestIds = [];

function updateRequestSelectionToolbar() {
  const toolbar = document.getElementById('requestArchiveToolbar');
  if (!toolbar) return;
  toolbar.hidden = false;
  const toggle = document.getElementById('requestSelectionToggle');
  const actions = document.getElementById('requestSelectionActions');
  const count = document.getElementById('requestSelectionCount');
  const apply = document.getElementById('requestArchiveBulkButton');
  const selectAll = document.getElementById('requestSelectAllToggle');
  if (toggle) toggle.hidden = requestSelectionMode;
  if (actions) actions.hidden = !requestSelectionMode;
  if (count) count.textContent = `${selectedRequestIds.size} selected`;
  if (selectAll) {
    const allSelected = selectableRequestIds.length > 0 && selectableRequestIds.every(id => selectedRequestIds.has(id));
    selectAll.textContent = allSelected ? 'Unselect all' : 'Select all';
    selectAll.disabled = requestArchivePending || selectableRequestIds.length === 0;
  }
  if (apply) {
    apply.textContent = `${adminRequestsTab === 'archives' ? 'Unarchive' : 'Archive'} selected (${selectedRequestIds.size})`;
    apply.disabled = requestArchivePending || selectedRequestIds.size === 0;
  }
}

function toggleRequestSelectionMode(force) {
  requestSelectionMode = typeof force === 'boolean' ? force : !requestSelectionMode;
  selectedRequestIds.clear();
  const message = document.getElementById('requestArchiveMessage');
  if (message) message.textContent = '';
  renderRequestsSection();
}
window.toggleRequestSelectionMode = toggleRequestSelectionMode;

function toggleRequestSelected(event, requestId) {
  event.stopPropagation();
  if (requestArchivePending) return;
  const id = Number(requestId);
  if (selectedRequestIds.has(id)) selectedRequestIds.delete(id);
  else selectedRequestIds.add(id);
  renderRequestsSection();
}
window.toggleRequestSelected = toggleRequestSelected;

function setSelectableRequestIds(rows) {
  selectableRequestIds = rows.map(row => Number(row.request_id || row.id));
  const available = new Set(selectableRequestIds);
  for (const id of selectedRequestIds) {
    if (!available.has(id)) selectedRequestIds.delete(id);
  }
  updateRequestSelectionToolbar();
}

function toggleSelectAllRequests() {
  if (requestArchivePending || !selectableRequestIds.length) return;
  const allSelected = selectableRequestIds.every(id => selectedRequestIds.has(id));
  if (allSelected) selectedRequestIds.clear();
  else selectableRequestIds.forEach(id => selectedRequestIds.add(id));
  renderRequestsSection();
}
window.toggleSelectAllRequests = toggleSelectAllRequests;

async function setRequestArchive(requestIds, archive) {
  const ids = [...new Set(requestIds.map(Number).filter(Number.isInteger))];
  if (!ids.length || requestArchivePending) return;
  const message = document.getElementById('requestArchiveMessage');
  requestArchivePending = true;
  updateRequestSelectionToolbar();
  if (message) message.textContent = `${archive ? 'Archiving' : 'Unarchiving'} ${ids.length} request${ids.length === 1 ? '' : 's'}...`;
  try {
    const { data, error } = await bloodBank().rpc('set_request_archive', {
      p_request_ids: ids, p_archive: archive
    });
    if (error) throw error;
    if (Number(data) !== ids.length) throw new Error('The archive update was not confirmed. Refresh and retry.');
    requestSelectionMode = false;
    selectedRequestIds.clear();
    await refreshRequestsSection();
    if (message) message.textContent = `${ids.length} request${ids.length === 1 ? '' : 's'} ${archive ? 'archived' : 'unarchived'}.`;
  } catch (error) {
    if (message) message.textContent = error?.message || 'Unable to update the archive. Please retry.';
  } finally {
    requestArchivePending = false;
    updateRequestSelectionToolbar();
  }
}

function archiveSelectedRequests() {
  return setRequestArchive([...selectedRequestIds], adminRequestsTab !== 'archives');
}
window.archiveSelectedRequests = archiveSelectedRequests;
