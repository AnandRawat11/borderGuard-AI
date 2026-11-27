import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

export async function loadCocoSsdModel(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        await tf.setBackend('webgl');
      } catch (e) {
        console.warn('[AI] WebGL backend initialization fallback:', e);
      }
      await tf.ready();
      return await cocoSsd.load({ base: 'mobilenet_v2' });
    })();
  }
  return modelPromise;
}
