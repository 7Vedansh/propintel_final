import { pipeline, env } from '@huggingface/transformers';

// Web environment setup
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

class PipelineSingleton {
  static task = 'zero-shot-object-detection';
  static model = 'Xenova/owlvit-base-patch32';
  static instance = null;

  static async getInstance(progress_callback = null) {
      if (this.instance === null) {
          this.instance = await pipeline(this.task, this.model, {
              quantized: true,
              progress_callback,
          });
      }
      return this.instance;
  }
}

self.addEventListener('message', async (event) => {
    const { action, imageUrl, candidateLabels } = event.data;

    if (action === 'initialize') {
        try {
           self.postMessage({ status: 'init_start' });
           let lastProgress = 0;
           await PipelineSingleton.getInstance(x => {
              // We only post meaningful progress updates (e.g., when weights are downloading)
              if (x.status === 'progress' && x.progress > lastProgress + 5) {
                 lastProgress = x.progress;
                 self.postMessage({ status: 'progress', data: x });
              } else if (x.status === 'init' || x.status === 'ready' || x.status === 'done') {
                 self.postMessage({ status: 'progress', data: x });
              }
           });
           self.postMessage({ status: 'ready' });
        } catch (error) {
           self.postMessage({ status: 'error', data: error.message });
        }
    }

    if (action === 'detect') {
        try {
           self.postMessage({ status: 'inference_start' });
           const detector = await PipelineSingleton.getInstance();
           
           // OwlViT expects generic object URLs to be processed, we will run the pipeline
           const output = await detector(imageUrl, candidateLabels, { 
              threshold: 0.08
           });
           
           self.postMessage({ status: 'complete', output });
        } catch (e) {
           self.postMessage({ status: 'error', data: e.message });
        }
    }
});
