const meridianRatio = .48;

export function createWorldIcon() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'world-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '28'); icon.setAttribute('height', '28');
  icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.5'); icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="' + (8 * meridianRatio) + '" ry="8"/><path d="M4 12h16"/>';
  return icon;
}

export function drawWorldIcon(canvas: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const centerX = x + width / 2, centerY = y + height / 2;
  const radius = Math.min(width, height) * .24;
  canvas.save();
  canvas.strokeStyle = '#ffffff30';
  canvas.lineWidth = Math.max(1.2, Math.min(2.5, radius / 20));
  canvas.beginPath(); canvas.arc(centerX, centerY, radius, 0, Math.PI * 2); canvas.stroke();
  canvas.beginPath(); canvas.ellipse(centerX, centerY, radius * meridianRatio, radius, 0, 0, Math.PI * 2); canvas.stroke();
  canvas.beginPath(); canvas.moveTo(centerX - radius, centerY); canvas.lineTo(centerX + radius, centerY); canvas.stroke();
  canvas.restore();
}
