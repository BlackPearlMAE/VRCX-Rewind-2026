import { getVRChatImagesAllowed, onVRChatImagesChange, setVRChatImagesAllowed } from './world-thumbnail';

export function createRecapImagePermission(page: HTMLElement) {
  const element = document.createElement('div');
  element.className = 'image-permission recap-image-permission';
  element.innerHTML = `
    <label class="image-permission-label">
      <input type="checkbox" role="switch" autocomplete="off">
      <span class="image-permission-track" aria-hidden="true"></span>
      <span>Load images from VRChat</span>
    </label>`;
  const input = element.querySelector('input')!;
  let available = false;
  let enabledHere = false;

  function sync() {
    const restoreFocus = document.activeElement === input;
    input.checked = getVRChatImagesAllowed();
    if (!input.checked) enabledHere = false;
    element.hidden = !available || (input.checked && !enabledHere);
    if (element.hidden && restoreFocus) page.focus({ preventScroll: true });
  }

  input.addEventListener('change', () => {
    enabledHere = input.checked;
    setVRChatImagesAllowed(input.checked);
  });
  onVRChatImagesChange(sync);
  sync();
  return {
    element,
    setAvailable(value: boolean) {
      available = value;
      sync();
    },
  };
}
