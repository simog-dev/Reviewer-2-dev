function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function resetDraggableModal(overlay) {
  const modal = overlay?.querySelector('.modal');
  if (!modal) return;

  modal.classList.remove('is-dragging');
  modal.style.position = '';
  modal.style.left = '';
  modal.style.top = '';
  modal.style.margin = '';
  modal.style.width = '';
  modal.style.maxWidth = '';
  modal.style.transform = '';
}

export function setupDraggableModals(overlays = []) {
  overlays.forEach((overlay) => {
    const modal = overlay?.querySelector('.modal');
    const header = modal?.querySelector('.modal-header');
    if (!modal || !header || header.dataset.draggableModalBound === 'true') {
      return;
    }

    header.dataset.draggableModalBound = 'true';

    header.addEventListener('pointerdown', (event) => {
      const interactiveTarget = event.target.closest('button, input, select, textarea, a, label');
      if (interactiveTarget) return;

      event.preventDefault();

      const rect = modal.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;

      modal.style.position = 'fixed';
      modal.style.left = `${rect.left}px`;
      modal.style.top = `${rect.top}px`;
      modal.style.margin = '0';
      modal.style.width = `${rect.width}px`;
      modal.style.maxWidth = `${rect.width}px`;
      modal.style.transform = 'none';
      modal.classList.add('is-dragging');

      const move = (moveEvent) => {
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        const nextLeft = clamp(moveEvent.clientX - offsetX, 0, maxLeft);
        const nextTop = clamp(moveEvent.clientY - offsetY, 0, maxTop);

        modal.style.left = `${nextLeft}px`;
        modal.style.top = `${nextTop}px`;
      };

      const stop = () => {
        modal.classList.remove('is-dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
  });
}
