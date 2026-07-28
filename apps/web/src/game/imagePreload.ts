interface DecodableImage {
  src: string;
  complete: boolean;
  onload: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  decode(): Promise<void>;
}

/**
 * Resolve only after a UI plate has finished decoding, so mounting its screen cannot pop
 * from an empty background to the final image on the next frame.
 */
export function preloadDecodedImage(
  src: string,
  createImage: () => DecodableImage = () => new Image(),
): Promise<boolean> {
  return new Promise((resolve) => {
    const image = createImage();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
    const decode = () => {
      void image.decode().then(
        () => finish(true),
        () => finish(false),
      );
    };
    image.onload = decode;
    image.onerror = () => finish(false);
    image.src = src;
    if (image.complete) decode();
  });
}
