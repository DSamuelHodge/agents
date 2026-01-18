// R2 artifact storage for workflow files
import type { R2Bucket } from '@cloudflare/workers-types';

export class ArtifactR2Storage {
  constructor(private bucket: R2Bucket) {}

  async storeWorkflowFiles(workflowId: string, files: Record<string, string>) {
    const key = `workflows/${workflowId}/artifacts.tar.gz`;

    // Compress files (simplified - in real implementation, use proper tar/zip)
    const tarball = await this.compressFiles(files);

    await this.bucket.put(key, tarball, {
      httpMetadata: {
        contentType: 'application/gzip'
      },
      customMetadata: {
        workflowId,
        fileCount: String(Object.keys(files).length),
        createdAt: new Date().toISOString()
      }
    });

    return key;
  }

  async getWorkflowFiles(workflowId: string): Promise<Record<string, string>> {
    const key = `workflows/${workflowId}/artifacts.tar.gz`;
    const object = await this.bucket.get(key);

    if (!object) throw new Error('Artifacts not found');

    const tarball = await object.arrayBuffer();
    return await this.extractTarball(tarball);
  }

  private async compressFiles(files: Record<string, string>): Promise<ArrayBuffer> {
    // Simplified compression - in production, use proper tar/zip library
    const encoder = new TextEncoder();
    const data = JSON.stringify(files);
    return encoder.encode(data).buffer;
  }

  private async extractTarball(tarball: ArrayBuffer): Promise<Record<string, string>> {
    // Simplified extraction - in production, use proper tar/zip library
    const decoder = new TextDecoder();
    const data = decoder.decode(tarball);
    return JSON.parse(data);
  }
}
