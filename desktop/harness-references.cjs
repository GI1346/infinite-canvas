const { randomUUID } = require('node:crypto');
// In-memory, project-scoped handoff. No canvas index, credentials or automatic send.
function createHarnessReferences() {
  const batches = new Map();
  return {
    add(projectId, files) {
      if (typeof projectId !== 'string' || !projectId || !Array.isArray(files) || !files.length) throw new Error('请选择有内容的图片');
      const images = files.map(file => {
        if (!file || typeof file.nodeId !== 'string' || !file.nodeId || typeof file.name !== 'string' || typeof file.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(file.dataUrl)) throw new Error('图片引用格式无效或不受 Harness 支持');
        return { nodeId: file.nodeId, name: file.name, dataUrl: file.dataUrl };
      });
      const batch = { id: randomUUID(), projectId, files: images };
      batches.set(batch.id, batch);
      return batch.id;
    },
    get(projectId) { return [...batches.values()].filter(batch => batch.projectId === projectId); },
    ack(projectId, id) { if (batches.get(id)?.projectId === projectId) batches.delete(id); },
  };
}
module.exports = { createHarnessReferences };
