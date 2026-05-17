import { pipeline, env } from '@huggingface/transformers';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import path from 'node:path';
import { existsSync } from 'node:fs';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

function resolveModelsDir(): string {
  // Packaged Electron app: models are in <install>/resources/models/
  // Dev build: models are in <cwd>/resources/models/
  const candidates = [
    // Electron packaged: process.resourcesPath is set by electron
    ...(typeof process !== 'undefined' && (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      ? [path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!, 'models')]
      : []),
    path.join(process.cwd(), 'resources', 'models'),
    // Vitest runs from project root
    path.resolve('resources', 'models'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1];
}

export class EmbeddingService {
  private pipe: FeatureExtractionPipeline | null = null;

  private async load(): Promise<FeatureExtractionPipeline> {
    if (this.pipe) return this.pipe;

    const modelsDir = resolveModelsDir();
    env.localModelPath = modelsDir;
    env.allowRemoteModels = false;
    env.allowLocalModels = true;

    this.pipe = (await pipeline('feature-extraction', MODEL_ID, {
      device: 'cpu',
      model_file_name: 'model_quantized',
    })) as unknown as FeatureExtractionPipeline;
    return this.pipe;
  }

  async embed(text: string): Promise<Float32Array> {
    const extractor = await this.load();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    // output.data is DataArray (AnyTypedArray | any[]) — cast to Float32Array
    return new Float32Array(output.data as ArrayLike<number>);
  }

  async dispose(): Promise<void> {
    if (this.pipe) {
      await (this.pipe as FeatureExtractionPipeline & { dispose?: () => Promise<void> }).dispose?.();
      this.pipe = null;
    }
  }
}
