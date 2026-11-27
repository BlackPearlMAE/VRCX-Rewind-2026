export interface CardCropTarget {}
interface CroppableTrack extends MediaStreamTrack { cropTo?: (target: CardCropTarget) => Promise<void> }
interface CropFactory { fromElement: (element: Element) => Promise<CardCropTarget> }
type FrameGrabber = new (track: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> };
export interface CardCapture { blob: Blob; width: number; height: number; stopped: boolean; method: string }
function cropFactory(): CropFactory | undefined {
  return (globalThis as unknown as { CropTarget?: CropFactory }).CropTarget;
}
export function canCaptureCard(): boolean {
  return !!navigator.mediaDevices?.getDisplayMedia && !!cropFactory()?.fromElement;
}
export async function prepareCardCrop(element: HTMLElement): Promise<CardCropTarget> {
  const factory=cropFactory();
  if(!factory)throw new Error('This browser does not support cropping tab capture to the card.');
  return factory.fromElement(element);
}
async function waitForCapture<T>(pending: Promise<T>,track: MediaStreamTrack,signal?: AbortSignal,timeoutMs=10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort=()=>{};let onEnded=()=>{};
  try {
    return await Promise.race([pending,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('No cropped frame arrived. Please try again.')),timeoutMs);
      onAbort=()=>reject(new DOMException('Capture cancelled.','AbortError'));
      onEnded=()=>reject(new Error('Tab sharing stopped before the screenshot was ready.'));
      signal?.addEventListener('abort',onAbort,{once:true});track.addEventListener('ended',onEnded,{once:true});
      if(signal?.aborted)onAbort();
    })]);
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',onAbort);track.removeEventListener('ended',onEnded);}
}
/** Call directly from a user click. No frame is inspected before own-tab cropping succeeds. */
export async function captureCard(crop: CardCropTarget, signal?: AbortSignal): Promise<CardCapture> {
  let stream: MediaStream | undefined,bitmap: ImageBitmap | undefined;
  const video=document.createElement('video');video.muted=true;video.playsInline=true;
  function abortCheck() {if(signal?.aborted)throw new DOMException('Capture cancelled.','AbortError');}
  const stop=()=>stream?.getTracks().forEach(track=>track.stop());
  signal?.addEventListener('abort',stop);
  try {
    abortCheck();
    // Do not await preparation before requesting capture: user activation is required.
    const options={audio:false,
      video:{displaySurface:'browser',width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:5,max:5}},
      preferCurrentTab:true,selfBrowserSurface:'include',monitorTypeSurfaces:'exclude',surfaceSwitching:'exclude',systemAudio:'exclude'};
    stream=await navigator.mediaDevices.getDisplayMedia(options);
    abortCheck();
    const track=stream.getVideoTracks()[0] as CroppableTrack | undefined;
    if(!track || track.getSettings().displaySurface!=='browser' || !track.cropTo)
      throw new Error('Select this browser tab. Window and entire-screen capture are not supported.');
    // Cropping rejects a target minted in a different tab. Never attach/read a video before it resolves.
    await track.cropTo(crop);abortCheck();
    let source: CanvasImageSource=video,width=0,height=0,method='video-frame';
    const Grab=(globalThis as unknown as {ImageCapture?: FrameGrabber}).ImageCapture;
    if(Grab) {
      const pending=new Grab(track).grabFrame();
      try {
        bitmap=await waitForCapture(pending,track,signal,3000);
        width=bitmap.width;height=bitmap.height;source=bitmap;method='ImageCapture.grabFrame';
      } catch(error) {
        void pending.then(frame=>frame.close(),()=>{});abortCheck();
        if(track.readyState!=='live')throw error;
      }
    }
    if(!bitmap) {
      video.srcObject=stream;
      // Register before play: a static card might not generate a second changed frame.
      const firstFrame=new Promise<void>(resolve=>{
        const next=(_time: number,frame: VideoFrameCallbackMetadata)=>{
          if(Math.abs(frame.width/frame.height-1080/1350)<.015 && video.videoWidth>0 && Math.abs(video.videoWidth/video.videoHeight-1080/1350)<.015)resolve();
          else video.requestVideoFrameCallback(next);
        };
        video.requestVideoFrameCallback(next);
      });
      await waitForCapture(Promise.all([video.play(),firstFrame]),track,signal);
      width=video.videoWidth;height=video.videoHeight;source=video;method='video-frame';
    }
    abortCheck();
    if(!width || !height)throw new Error('The captured card is empty.');
    if(Math.abs(width/height-1080/1350)>.015)throw new Error('The captured card was clipped. Make the preview smaller and try again.');
    const output=document.createElement('canvas');output.width=width;output.height=height;
    output.getContext('2d')!.drawImage(source,0,0,width,height);
    bitmap?.close();bitmap=undefined;stop();video.pause();video.srcObject=null;
    const blob=await new Promise<Blob>((resolve,reject)=>{
      try {output.toBlob(value=>value ? resolve(value) : reject(new Error('PNG encoding failed.')),'image/png');}
      catch {reject(new Error('The captured frame could not be exported as PNG.'));}
    });
    abortCheck();
    return {blob,width,height,method,stopped:stream.getTracks().every(t=>t.readyState==='ended')};
  } finally {bitmap?.close();stop();video.pause();video.srcObject=null;signal?.removeEventListener('abort',stop);}
}
