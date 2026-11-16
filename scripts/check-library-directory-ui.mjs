import { createServer } from 'vite';
import fs from 'node:fs/promises';
import { writeLibraryJsonAtomically } from '../electron/main/library/libraryJsonPersistence.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIRECTORY_QA_HTML = String.raw`<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>素材目录 QA</title></head><body><div id="root"></div><script type="module">
import React, { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '/src/components/LocaleProvider.tsx';
import { AppTitleBar } from '/src/features/library/components/shell/AppTitleBar.tsx';
import { LibraryDirectoryMode } from '/src/features/library/components/LibraryDirectoryMode.tsx';
import { LibraryMediaViewer, buildLibraryMediaViewerModel, resolveLibraryMediaViewerDirectory } from '/src/features/library/components/LibraryMediaViewer.tsx';
import { LibraryAssetInfo } from '/src/features/library/components/LibraryAssetInfo.tsx';
import { MediaFullscreenOverlay } from '/src/features/library/components/MediaFullscreenOverlay.tsx';
import { useLibraryStore } from '/src/features/library/store/useLibraryStore.ts';
import { createDefaultLibraryDirectorySettings, mergeLibraryDirectoryNodes } from '/src/features/library/utils/libraryDirectory.ts';
import { resolvePromptGroupPatchItemIds } from '/src/features/library/utils/promptImageGroups.ts';
import { toPromptCardData } from '/src/features/library/utils/promptFilters.ts';
import '/src/styles/tokens.css';

// The heavy, unmodified editor is downloaded only after the viewer's expand action.
const PromptDetailDialog = lazy(() => import('/src/features/library/components/PromptDetailDialog.tsx')
  .then(module => ({ default: module.PromptDetailDialog })));
const qa = window.__directoryQA = { events: [], errors: [], viewerSessions: 0, currentItemId: null };
const record = (action, payload) => qa.events.push({ action, payload, at: performance.now() });
addEventListener('error', event => qa.errors.push(event.message));
addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason?.message || event.reason)));
const fixtureResponse = await fetch('/__directory-fixture', { cache: 'no-store' });
if (!fixtureResponse.ok) throw new Error('QA fixture 读取失败');
const data = qa.data = await fixtureResponse.json();
const pending = new Set();
let mutationChain = Promise.resolve();
function callFixture(url, payload) {
  const task = fetch(url, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: 'no-store',
  }).then(response => response.json());
  pending.add(task);
  void task.finally(() => pending.delete(task)).catch(() => {});
  return task;
}
function queueMutation(task) {
  const next = mutationChain.then(task, task);
  mutationChain = next.catch(() => {});
  return next;
}
qa.whenIdle = async () => {
  await mutationChain;
  do {
    await Promise.allSettled([...pending]);
    await new Promise(resolve => requestAnimationFrame(resolve));
  } while (pending.size);
};
qa.state = () => useLibraryStore.getState();
qa.failNextSave = () => callFixture('/__directory-fail-save', {});
const mediaUrl = (name, source = 'original') => '/__directory-media/' + source + '/' + encodeURIComponent(name);
let maximized = false;
let alwaysOnTop = false;
const maximizeListeners = new Set();

// Explicit browser-only API whitelist. There is no preload bridge or official library path.
window.suyanApi = {
  logStartupEvent: record,
  writeClipboardText: async text => { qa.clipboard = { text }; record("palette-copy", text); return { ok: true, data: undefined }; },
  saveLibraryViewSettings: settings => callFixture('/__directory-settings', settings),
  readLibrary: async () => {
    const fixture = await callFixture('/__directory-fixture');
    return { ok: true, data: fixture.library };
  },
  saveLibrary: library => callFixture('/__directory-library', library),
  saveAiSettings: payload => callFixture('/__directory-ai-settings', payload),
  isWindowMaximized: async () => ({ ok: true, data: { maximized } }),
  onWindowMaximizeChange: listener => { maximizeListeners.add(listener); return () => maximizeListeners.delete(listener); },
  isWindowAlwaysOnTop: async () => ({ ok: true, data: { alwaysOnTop } }),
  toggleAlwaysOnTopWindow: async () => { alwaysOnTop = !alwaysOnTop; record('window-top', alwaysOnTop); return { ok: true, data: { alwaysOnTop } }; },
  minimizeWindow: async () => { record('window-minimize', null); },
  toggleMaximizeWindow: async () => { maximized = !maximized; maximizeListeners.forEach(listener => listener(maximized)); record('window-maximize', maximized); return { ok: true, data: { maximized } }; },
  closeWindow: async () => { record('window-close', null); },
  resolveImageThumbnail: async name => {
    const entry = data.mediaPaths?.[name];
    const source = entry && typeof entry === 'object' && entry.thumbnail ? 'thumbnail' : 'original';
    return { ok: true, data: { source, src: mediaUrl(name, source) } };
  },
  getImageFileSize: async name => {
    const item = useLibraryStore.getState().items.find(value => value.imageFileName === name);
    const size = item?.mediaStorage && item.mediaStorage !== 'managed' ? item.mediaStorage.size : item?.importSource?.size;
    return { ok: true, data: { size: size ?? item?.mediaSize ?? 0 } };
  },
  getImagePaletteSample: async name => {
    record('palette-sample', name);
    return { ok: true, data: { width: 2, height: 1, pixels: new Uint8Array([238, 130, 90, 255, 30, 100, 170, 255]) } };
  },
};
const defaults = useLibraryStore.getState();
const saved = data.viewSettings || {};
const initialDirectorySettings = {
  ...createDefaultLibraryDirectorySettings(),
  ...data.directorySettings,
  ...data.settings,
  includeDescendants: saved.libraryDirectorySettings?.includeDescendants ?? false,
};
useLibraryStore.setState({
  items: data.items,
  libraryRoots: data.roots,
  libraryDirectorySettings: mergeLibraryDirectoryNodes({ items: data.items, roots: data.roots, settings: initialDirectorySettings }),
  likedImageIds: saved.likedImageIds || [],
  imageViewTransforms: saved.imageViewTransforms || defaults.imageViewTransforms,
  generationModelOrder: saved.generationModelOrder || defaults.generationModelOrder,
  hiddenGenerationModels: saved.hiddenGenerationModels || defaults.hiddenGenerationModels,
  categoryTaxonomy: saved.categoryWorkspace?.taxonomy || data.library?.categoryTaxonomy || defaults.categoryTaxonomy,
  promptLexicons: saved.promptLexicons || defaults.promptLexicons,
  visualLife: saved.visualLife || defaults.visualLife,
  aiSettings: data.aiSettings || defaults.aiSettings,
  blurNsfwImages: false,
});

async function saveMetadata(patches, deletedItemIds = []) {
  return queueMutation(async () => {
    try {
      const result = await callFixture('/__directory-metadata', { patches, deletedItemIds });
      if (result.ok) {
        useLibraryStore.setState({ items: result.data.items });
        data.items = result.data.items;
      }
      record('save-metadata', { ids: patches.map(value => value.id), deletedItemIds, ok: result.ok, error: result.error });
      return result.ok;
    } catch (error) {
      record('save-metadata', { ok: false, message: String(error.message) });
      return false;
    }
  });
}
const saveItem = (id, patch) => saveMetadata([{ id, patch }]);
const copyImage = async name => { qa.clipboard = { imageFileName: name, src: mediaUrl(name) }; record('copy-image', name); };
const copyText = async (text, label) => { qa.clipboard = { text }; record('copy-text', { text, label }); };
const exportImage = async name => { qa.lastExport = { imageFileName: name, src: mediaUrl(name) }; record('export-image', qa.lastExport); };
const toggleFavorite = async id => { await useLibraryStore.getState().toggleFavoriteImage(id); record('favorite', id); };
const fixtureAction = async (action, payload, fallback = false) => {
  record(action, payload);
  return data.actionResults?.[action] ?? fallback;
};

function Fixture() {
  // Selecting another image must not subscribe/recompute the entire store object.
  const items = useLibraryStore(state => state.items);
  const roots = useLibraryStore(state => state.libraryRoots);
  const settings = useLibraryStore(state => state.libraryDirectorySettings);
  const likedImageIds = useLibraryStore(state => state.likedImageIds);
  const visualLife = useLibraryStore(state => state.visualLife);
  const aiSettings = useLibraryStore(state => state.aiSettings);
  const generationModelOrder = useLibraryStore(state => state.generationModelOrder);
  const hiddenGenerationModels = useLibraryStore(state => state.hiddenGenerationModels);
  const taxonomy = useLibraryStore(state => state.categoryTaxonomy);
  const imageViewTransforms = useLibraryStore(state => state.imageViewTransforms);
  const saveDirectorySettings = useLibraryStore(state => state.saveLibraryDirectorySettings);
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const [viewerId, setViewerId] = useState(null);
  const [preview, setPreview] = useState(null);
  const model = useMemo(() => buildLibraryMediaViewerModel(items, roots, settings), [items, roots, settings]);
  const currentItem = model.itemsById.get(viewerId);
  const currentDirectoryId = resolveLibraryMediaViewerDirectory(viewerId || '', model);
  const directoryItems = model.itemsByDirectory.get(currentDirectoryId) || [];
  const currentIndex = model.positionsByItemId.get(viewerId) ?? 0;
  const knownCategories = useMemo(() => [...new Set([
    ...(taxonomy?.nodes || []).map(node => node.name),
    ...items.map(item => item.category).filter(Boolean),
  ])], [items, taxonomy]);
  const openViewer = useCallback(id => {
    if (!useLibraryStore.getState().items.some(item => item.id === id)) return;
    record('detail', id);
    setViewerId(previous => { if (previous === null) qa.viewerSessions += 1; return id; });
  }, []);
  const saveImageViewTransform = useCallback((itemId, transform) =>
    useLibraryStore.getState().saveImageViewTransform(itemId, transform), []);
  const selectViewerItem = useCallback(id => { record('viewer-select', id); setViewerId(id); }, []);
  const closeViewer = useCallback(() => { record('viewer-close', null); setViewerId(null); }, []);
  const navigateViewer = delta => {
    const next = directoryItems[Math.max(0, Math.min(directoryItems.length - 1, currentIndex + delta))];
    if (next) selectViewerItem(next.id);
  };
  useEffect(() => {
    qa.currentItemId = viewerId;
    qa.openViewer = openViewer;
    qa.selectViewerItem = selectViewerItem;
    qa.closeViewer = closeViewer;
    qa.viewerElement = () => document.querySelector('[aria-label="大图详情查看器"]');
    qa.viewerState = () => {
      const element = qa.viewerElement();
      const directoryId = element?.querySelector('[data-media-viewer-directory][aria-selected="true"]')?.dataset.mediaViewerDirectory || null;
      const localItems = model.itemsByDirectory.get(directoryId) || [];
      return {
        open: Boolean(element),
        currentItemId: viewerId,
        directoryId,
        directoryItemIds: localItems.map(item => item.id),
        visibleFilmstripIds: [...(element?.querySelectorAll('[data-media-viewer-thumbnail]') || [])].map(node => node.dataset.mediaViewerThumbnail),
        promptExpanded: element?.querySelector('[aria-label="收起提示词"]')?.getAttribute('aria-expanded') === 'true',
        promptMounted: Boolean(element?.querySelector('[data-prompt-detail-presentation="panel"]')),
        savedTransform: imageViewTransforms[viewerId] || null,
        viewerSessions: qa.viewerSessions,
      };
    };
  }, [viewerId, model, imageViewTransforms, openViewer, selectViewerItem, closeViewer]);
  useEffect(() => { if (viewerId && !model.itemsById.has(viewerId)) closeViewer(); }, [viewerId, model, closeViewer]);

  const renderInfo = (itemId, compact) => {
    const item = model.itemsById.get(itemId);
    if (!item) return null;
    const directoryId = resolveLibraryMediaViewerDirectory(itemId, model);
    const rootId = item.mediaStorage && item.mediaStorage !== 'managed' ? item.mediaStorage.rootId : item.importSource?.rootId;
    return React.createElement(LibraryAssetInfo, {
      key: item.id, item, compact, blur: false, favorite: likedImageIds.includes(itemId),
      root: roots.find(root => root.id === rootId),
      directoryName: model.nodesById.get(directoryId)?.name,
      onSave: saveItem, onPreview: setPreview, onCopyImage: copyImage, onCopyText: copyText,
      onFavorite: toggleFavorite, onExport: exportImage,
      onLocate: () => { record('locate', itemId); closeViewer(); setDirectoryOpen(true); void saveDirectorySettings({ ...settings, browseBy: 'directories', selectedNodeId: directoryId, includeDescendants: false, searchQuery: '', mediaFilter: 'all', favoriteOnly: false, formatFilter: '', tagFilter: '', categoryFilter: '', minimumRating: 0, availabilityFilter: 'all' }); },
      onFilterTag: tag => { record('filter-tag', tag); closeViewer(); setDirectoryOpen(true); void saveDirectorySettings({ ...settings, browseBy: 'directories', selectedNodeId: directoryId, includeDescendants: false, searchQuery: '', mediaFilter: 'all', favoriteOnly: false, formatFilter: '', tagFilter: tag, categoryFilter: '', minimumRating: 0, availabilityFilter: 'all' }); },
    });
  };
  const renderPromptPanel = (_itemId, onCollapse) => currentItem ? React.createElement(PromptDetailDialog, {
    presentation: 'panel', item: toPromptCardData(currentItem), isBusy: false,
    imageCount: directoryItems.length, imageIndex: currentIndex,
    generationModelOrder, hiddenGenerationModels, aiSettings, blurNsfwImages: false,
    isImageLiked: likedImageIds.includes(currentItem.id), knownCategories,
    onClose: onCollapse,
    onSave: async (patch, options) => {
      const ids = resolvePromptGroupPatchItemIds(useLibraryStore.getState().items, currentItem.id, patch);
      const ok = await saveMetadata(ids.map(id => ({ id, patch })));
      record('save-prompt', { ids, patch, options, ok });
      if (!ok) throw new Error('QA 提示词保存失败，请重试。');
    },
    onSaveGenerationModelPreferences: patch => { void useLibraryStore.getState().saveGenerationModelPreferences(patch); },
    onSaveAiActionModelPreference: (action, selection) => useLibraryStore.getState().saveAiActionModelPreference(action, selection),
    onSaveAiRecognitionSourcePreferences: preferences => useLibraryStore.getState().saveAiRecognitionSourcePreferences(preferences),
    onUpsertCustomCategory: input => useLibraryStore.getState().upsertCustomCategory(input),
    onAnalyzePrompt: async payload => {
      record('analyze-prompt', payload);
      if (data.actionResults?.['analyze-prompt']) return data.actionResults['analyze-prompt'];
      throw new Error('QA fixture 未配置 AI 分析响应');
    },
    onOptimizePrompt: payload => fixtureAction('optimize-prompt', payload, null),
    onTranslatePrompt: payload => fixtureAction('translate-prompt', payload, null),
    onReverseImagePrompt: payload => fixtureAction('reverse-image-prompt', payload, null),
    onCopyImage: () => { void copyImage(currentItem.imageFileName); },
    onCopyText: text => { void copyText(text, '提示词已复制'); },
    onDelete: () => { void saveMetadata([], [currentItem.id]).then(ok => { if (ok) closeViewer(); }); },
    onExportImage: () => { void exportImage(currentItem.imageFileName); },
    onImportClipboardImage: () => { void fixtureAction('import-clipboard-image', currentItem.id); },
    onImportImages: () => { void fixtureAction('import-images', currentItem.id); },
    onPushToCanvas: (prompt, negativePrompt) => { qa.canvasDraft = { prompt, negativePrompt }; record('push-to-canvas', qa.canvasDraft); },
    onPushPromptToCanvas: (prompt, negativePrompt) => { qa.canvasDraft = { prompt, negativePrompt }; record('push-prompt-to-canvas', qa.canvasDraft); },
    onNavigateNext: () => navigateViewer(1), onNavigatePrevious: () => navigateViewer(-1),
    onShareGroup: () => { record('share-group', { itemId: currentItem.id }); },
    onToggleImageLike: () => { void toggleFavorite(currentItem.id); },
    onGenerateVideoFrames: id => fixtureAction('generate-video-frames', id),
    onImportVideoReferenceImages: id => fixtureAction('import-video-reference-images', id),
    onDeleteVideoReferenceImage: (id, imageFileName) => fixtureAction('delete-video-reference-image', { id, imageFileName }),
    onImportClipboardReferenceImage: id => fixtureAction('import-clipboard-reference-image', id),
    onImportReferenceImageFromUrl: (id, url) => fixtureAction('import-reference-image-url', { id, url }),
  }) : null;

  return React.createElement(LocaleProvider, null,
    React.createElement('main', { className: 'app-shell relative flex h-full min-h-0 flex-col overflow-hidden text-foreground' },
      React.createElement(AppTitleBar, { isSidebarOpen: !directoryOpen, onToggleSidebar: () => record('sidebar', null) }),
      directoryOpen ? React.createElement(LibraryDirectoryMode, {
        items, roots, settings, categoryTaxonomy: taxonomy, likedImageIds, visualLifeSettings: visualLife,
        blurNsfwImages: false, isBusy: false, isSidebarOpen: true,
        onChangeSettings: saveDirectorySettings, onExit: () => setDirectoryOpen(false),
        onAddDirectory: () => record('add-directory', null), onOpenManager: () => record('manager', null),
        onScanRoot: id => record('scan', id), onValidate: () => record('validate', null),
        // Match LibraryView's embedded viewer composition so double-clicks exercise the production path.
        onPrepareItem: openViewer,
        renderFocusedViewer: ({ itemId, promptExpanded, promptRequestToken }, callbacks) => React.createElement(LibraryMediaViewer, {
          embedded: true, directoryOnly: true, showDirectoryTree: false,
          items, roots, directorySettings: settings, currentItemId: itemId,
          blurNsfwImages: false, imageViewTransforms,
          initialPromptExpanded: promptExpanded, promptRequestToken,
          onSelectItem: id => { callbacks.onSelectItem(id); selectViewerItem(id); },
          onClose: () => { callbacks.onClose(); closeViewer(); },
          onImmersiveChange: callbacks.onImmersiveChange,
          onSaveImageViewTransform: saveImageViewTransform, renderInfo, renderPromptPanel,
        }),
        onCopyImage: copyImage, onCopyText: copyText, onToggleFavorite: toggleFavorite,
        onSaveItem: saveItem, onExportImage: exportImage,
        onSaveTags: (ids, tags) => {
          const byId = new Map(useLibraryStore.getState().items.map(item => [item.id, item]));
          return saveMetadata(ids.map(id => ({ id, patch: { tags: [...new Set([...(byId.get(id)?.tags || []), ...tags])] } })));
        },
        onRenameItem: (id, title) => saveItem(id, { title }),
        onExportItems: ids => fixtureAction('export', ids),
        onDeleteItems: ids => saveMetadata([], ids),
      }) : React.createElement('section', { className: 'flex-1 p-6', 'aria-label': '普通素材浏览' },
        React.createElement('button', { onClick: () => setDirectoryOpen(true) }, '素材目录')),
      // Intentionally no item-id key: local directory, zoom, and expanded-prompt state survive filmstrip navigation.
      !directoryOpen && currentItem ? React.createElement(LibraryMediaViewer, {
        items, roots, directorySettings: settings, currentItemId: viewerId, directoryOnly: directoryOpen,
        blurNsfwImages: false, imageViewTransforms, onSelectItem: selectViewerItem, onClose: closeViewer,
        onSaveImageViewTransform: saveImageViewTransform,
        renderInfo, renderPromptPanel,
      }) : null,
      preview ? React.createElement(MediaFullscreenOverlay, { item: preview, onClose: () => setPreview(null) }) : null,
    ));
}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`;

const METADATA_FIELDS = new Set([
  'title', 'prompt', 'negativePrompt', 'notes', 'rating', 'tags', 'category', 'categoryId',
  'genreIds', 'categoryConfidence', 'categorySource', 'legacyCategory', 'generationMethod',
  'promptType', 'sourceUrl', 'authorName', 'authorUrl', 'authorAvatarUrl', 'nsfwRating', 'nsfwCheckedAt',
]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const errorResult = (code, message) => ({ ok: false, error: { code, message } });
function requestError(message) { return Object.assign(new Error(message), { statusCode: 400 }); }
function metadataPatch(input) {
  if (!isRecord(input)) throw requestError('Invalid metadata patch');
  return Object.fromEntries(Object.entries(input).filter(([key]) => METADATA_FIELDS.has(key)));
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
async function writeJsonAtomic(file, data) {
  await writeLibraryJsonAtomically(file, JSON.stringify(data, null, 2) + '\n');
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 4 * 1024 * 1024) throw requestError('QA payload too large');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function sendJson(res, result, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result));
}
function publicAiSettings(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.profiles)) throw requestError('Invalid QA AI settings');
  const profiles = payload.profiles.map(profile => ({
    id: profile.id, name: profile.name, enabled: Boolean(profile.enabled), provider: profile.provider,
    baseUrl: profile.baseUrl, model: profile.model, models: profile.models || [],
    hasApiKey: false, apiKeyPreview: '',
  }));
  const active = profiles.find(profile => profile.id === payload.activeProfileId) || profiles[0];
  return {
    activeProfileId: active?.id || '', actionOrder: payload.actionOrder, profiles,
    actionPreferences: payload.actionPreferences || {}, recognitionSourcePreferences: payload.recognitionSourcePreferences || {},
    enabled: active?.enabled || false, baseUrl: active?.baseUrl || '', model: active?.model || '',
    hasApiKey: false, apiKeyPreview: '',
  };
}
function mediaContentType(file, buffer) {
  const signature = buffer.subarray(0, 12);
  if (signature.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (signature.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (signature.subarray(0, 3).toString() === 'GIF') return 'image/gif';
  if (signature.subarray(0, 4).toString() === 'RIFF' && signature.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// Reusable middleware permits offline route validation without starting/stopping any service.
export function createDirectoryQaMiddleware({ fixturePath: inputPath, transformHtml = async value => value }) {
  const fixturePath = path.resolve(inputPath);
  const statePath = fixturePath + '.ui-settings.json';
  const metadataPath = fixturePath + '.ui-metadata.json';
  let failNext = false;
  let writeChain = Promise.resolve();
  const queueWrite = task => {
    const next = writeChain.then(task, task);
    writeChain = next.catch(() => {});
    return next;
  };
  async function loadFixture() {
    const fixture = await readJson(fixturePath);
    if (!Array.isArray(fixture.items) || !Array.isArray(fixture.roots) || !isRecord(fixture.mediaPaths)) throw requestError('Expected an isolated directory QA fixture');
    const saved = await readJson(statePath, {});
    const metadata = await readJson(metadataPath, {});
    const deleted = new Set(metadata.deletedItemIds || []);
    const items = fixture.items.filter(item => !deleted.has(item.id)).map(item => ({
      ...item,
      ...(metadata.items && Object.hasOwn(metadata.items, item.id) ? metadataPatch(metadata.items[item.id]) : {}),
      ...(metadata.items?.[item.id]?.updatedAt ? { updatedAt: metadata.items[item.id].updatedAt } : {}),
    }));
    const settings = {
      ...(fixture.directorySettings || {}), ...(fixture.settings || {}), includeDescendants: false,
      ...(saved.libraryDirectorySettings || {}),
    };
    return {
      ...fixture, items, settings, viewSettings: saved, aiSettings: saved.qaAiSettings || fixture.aiSettings,
      library: { ...fixture.library, schemaVersion: fixture.library?.schemaVersion || 2, updatedAt: metadata.updatedAt || fixture.library?.updatedAt || fixture.generatedAt, items },
    };
  }
  async function updateMetadata(patches, deletedItemIds) {
    if (!Array.isArray(patches) || !Array.isArray(deletedItemIds)) throw requestError('Invalid metadata operation');
    const fixture = await loadFixture();
    const knownIds = new Set(fixture.items.map(item => item.id));
    if (patches.some(entry => !isRecord(entry) || !knownIds.has(entry.id)) || deletedItemIds.some(id => !knownIds.has(id))) throw requestError('Unknown QA item');
    const previous = await readJson(metadataPath, {});
    const now = new Date().toISOString();
    const byId = Object.assign(Object.create(null), previous.items || {});
    for (const entry of patches) byId[entry.id] = { ...byId[entry.id], ...metadataPatch(entry.patch), updatedAt: now };
    await writeJsonAtomic(metadataPath, {
      items: byId, deletedItemIds: [...new Set([...(previous.deletedItemIds || []), ...deletedItemIds])], updatedAt: now,
    });
    return (await loadFixture()).library;
  }
  async function mutate(kind, payload) {
    return queueWrite(async () => {
      if (failNext) {
        failNext = false;
        return errorResult(kind === 'settings' ? 'VIEW_SETTINGS_SAVE_FAILED' : 'LIBRARY_SAVE_FAILED', '测试保存失败');
      }
      if (kind === 'settings' || kind === 'ai-settings') {
        if (!isRecord(payload)) throw requestError('Invalid QA settings');
        const previous = await readJson(statePath, {});
        const next = kind === 'ai-settings' ? { ...previous, qaAiSettings: publicAiSettings(payload) } : { ...previous, ...payload };
        await writeJsonAtomic(statePath, next);
        return { ok: true, data: kind === 'ai-settings' ? next.qaAiSettings : next };
      }
      if (kind === 'library') {
        if (!Array.isArray(payload?.items)) throw requestError('Invalid QA library');
        const fixture = await loadFixture();
        const ids = new Set(payload.items.map(item => item.id));
        const library = await updateMetadata(payload.items.map(item => ({ id: item.id, patch: item })), fixture.items.filter(item => !ids.has(item.id)).map(item => item.id));
        return { ok: true, data: library };
      }
      const library = await updateMetadata(payload.patches || [], payload.deletedItemIds || []);
      return { ok: true, data: library };
    });
  }
  async function serveMedia(req, res, pathname) {
    const match = pathname.match(/^\/__directory-media\/(original|thumbnail)\/(.+)$/);
    if (!match) { res.statusCode = 404; res.end(); return; }
    const name = decodeURIComponent(match[2]);
    const fixture = await loadFixture();
    const entry = Object.hasOwn(fixture.mediaPaths, name) ? fixture.mediaPaths[name] : null;
    const candidate = typeof entry === 'string' ? entry : entry?.[match[1]] || (match[1] === 'thumbnail' ? entry?.original : null);
    if (!candidate) { res.statusCode = 404; res.end(); return; }
    const allowed = [...(fixture.sourceDirectories || fixture.roots.map(item => item.absolutePath)), ...(fixture.cacheDirectories || [])].map(directory => path.resolve(directory));
    const resolveAllowed = file => {
      const absolute = path.resolve(file);
      if (!allowed.some(directory => { const relative = path.relative(directory, absolute); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); })) throw requestError('Media route escaped fixture roots');
      return absolute;
    };
    let absolute = resolveAllowed(candidate);
    let buffer;
    try { buffer = await fs.readFile(absolute); }
    catch (error) {
      if (error.code !== 'ENOENT' || match[1] !== 'thumbnail' || !entry?.original) throw error;
      absolute = resolveAllowed(entry.original);
      buffer = await fs.readFile(absolute);
    }
    res.setHeader('Content-Type', mediaContentType(absolute, buffer));
    res.setHeader('Accept-Ranges', 'bytes');
    let start = 0; let end = buffer.length - 1;
    if (req.headers?.range) {
      const range = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
      if (range && (range[1] || range[2])) {
        start = range[1] ? Number(range[1]) : Math.max(0, buffer.length - Number(range[2]));
        end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
      } else start = buffer.length;
      if (start >= buffer.length || start > end) { res.statusCode = 416; res.setHeader('Content-Range', 'bytes */' + buffer.length); res.end(); return; }
      res.statusCode = 206;
      res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + buffer.length);
    }
    res.setHeader('Content-Length', Math.max(0, end - start + 1));
    res.end(req.method === 'HEAD' ? undefined : buffer.subarray(start, end + 1));
  }
  return async (req, res, next) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const mutation = ({ '/__directory-settings': 'settings', '/__directory-metadata': 'metadata', '/__directory-library': 'library', '/__directory-ai-settings': 'ai-settings' })[url.pathname];
      if (mutation || url.pathname === '/__directory-fail-save') {
        if (req.method !== 'POST') { sendJson(res, errorResult('QA_METHOD_NOT_ALLOWED', 'QA mutations require POST'), 405); return; }
        if (url.pathname === '/__directory-fail-save') { failNext = true; sendJson(res, { ok: true }); return; }
        sendJson(res, await mutate(mutation, await readBody(req))); return;
      }
      if (url.pathname === '/__directory-qa') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(await transformHtml(DIRECTORY_QA_HTML)); return;
      }
      if (url.pathname === '/__directory-fixture') { await writeChain; sendJson(res, await loadFixture()); return; }
      if (url.pathname.startsWith('/__directory-media/')) { await serveMedia(req, res, url.pathname); return; }
      next();
    } catch (error) { sendJson(res, errorResult('DIRECTORY_QA_FAILED', String(error.message)), error.statusCode || 500); }
  };
}

export async function startDirectoryQaServer(fixturePath, port = 5198) {
  if (!fixturePath) throw new Error('Usage: node scripts/check-library-directory-ui.mjs <isolated-fixture.json> [port]');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid directory QA port');
  const server = await createServer({
    root,
    server: { host: '127.0.0.1', port, strictPort: true, watch: { ignored: ['**/release/**', '**/release-next/**', '**/recovery-backups/**', '**/output/**', '**/dist/**', '**/dist-electron/**', '**/.git/**'] } },
    plugins: [
      { name: 'directory-media-protocol-qa', enforce: 'pre', transform(code, id) {
        if (id.replaceAll('\\', '/').endsWith('/src/features/library/utils/getImageSrc.ts')) return code
          .replaceAll('app-image://local/', '/__directory-media/original/')
          .replaceAll('app-thumbnail://local/', '/__directory-media/thumbnail/')
          .replaceAll('app-startup://local/', '/__directory-media/original/');
      } },
      { name: 'directory-qa-server', configureServer(vite) {
        vite.middlewares.use(createDirectoryQaMiddleware({ fixturePath, transformHtml: html => vite.transformIndexHtml('/__directory-qa', html) }));
      } },
    ],
  });
  await server.listen();
  console.log('Directory QA server: http://127.0.0.1:' + port + '/__directory-qa');
  async function close() { await server.close(); process.exit(0); }
  process.on('SIGINT', close); process.on('SIGTERM', close);
  return server;
}

// Importing this module for syntax/route checks does not listen on a port or change a running service.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startDirectoryQaServer(process.argv[2], Number(process.argv[3] || 5198));
}
