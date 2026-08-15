import { HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { CurseforgeService } from './curseforge.service';

jest.mock('axios');

describe('CurseforgeService', () => {
  let service: CurseforgeService;
  const mockClient = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue(mockClient);
    service = new CurseforgeService();
  });

  it('searchMods should return normalized compatible results', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 100,
            slug: 'fabric-api',
            name: 'Fabric API',
            summary: 'Core library',
            downloadCount: 1500000,
            dateModified: '2026-02-01T00:00:00Z',
            logo: { thumbnailUrl: 'https://example.com/fabric.png' },
            latestFiles: [{ gameVersions: ['1.20.1', 'Fabric'] }],
          },
          {
            id: 101,
            slug: 'old-mod',
            name: 'Old Mod',
            summary: 'Old',
            downloadCount: 1000,
            dateModified: '2025-01-01T00:00:00Z',
            logo: { thumbnailUrl: 'https://example.com/old.png' },
            latestFiles: [{ gameVersions: ['1.19.4', 'Forge'] }],
          },
        ],
        pagination: {
          totalCount: 2,
        },
      },
    });

    const result = await service.searchMods('api-key', {
      minecraftVersion: '1.20.1',
      loader: 'fabric',
      pageSize: 20,
      index: 0,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      provider: 'curseforge',
      projectId: '100',
      slug: 'fabric-api',
      supportedLoaders: ['fabric'],
    });
    expect(result.pagination.resultCount).toBe(1);
  });

  it('searchMods should fail with missing api key', async () => {
    await expect(
      service.searchMods('', {
        minecraftVersion: '1.20.1',
      }),
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      service.searchMods('', {
        minecraftVersion: '1.20.1',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('searchMods should map 403 errors to forbidden', async () => {
    mockClient.get.mockRejectedValue({
      response: { status: 403 },
    });
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);

    await expect(
      service.searchMods('bad-key', {
        minecraftVersion: '1.20.1',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('resolveVersionsForMod should normalize files into versions', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 5001,
            displayName: '2.0.0',
            fileName: 'fabric-api-2.0.0.jar',
            fileDate: '2026-02-01T00:00:00Z',
            downloadUrl: 'https://example.com/fabric-api-2.0.0.jar',
            gameVersions: ['1.21.4', 'Fabric'],
            dependencies: [{ modId: 306612, relationType: 3 }],
          },
        ],
      },
    });

    const versions = await service.resolveVersionsForMod('api-key', 100);

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      provider: 'curseforge',
      versionId: '5001',
      versionNumber: '2.0.0',
      fileName: 'fabric-api-2.0.0.jar',
      downloadUrl: 'https://example.com/fabric-api-2.0.0.jar',
      mcVersions: ['1.21.4'],
      loaders: ['fabric'],
      dependencies: [{ projectId: '306612', dependencyType: 'required' }],
    });
  });

  it('getFileChangelog should return the changelog body', async () => {
    mockClient.get.mockResolvedValue({ data: { data: 'Fixed a crash' } });

    const changelog = await service.getFileChangelog('api-key', 100, 5001);

    expect(mockClient.get).toHaveBeenCalledWith('/mods/100/files/5001/changelog');
    expect(changelog).toBe('Fixed a crash');
  });

  it('getFileChangelog should return an empty string for a missing changelog', async () => {
    mockClient.get.mockRejectedValue({ response: { status: 404 } });
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);

    const changelog = await service.getFileChangelog('api-key', 100, 9999);

    expect(changelog).toBe('');
  });

  it('resolveModBySlug should return the matching mod', async () => {
    mockClient.get.mockResolvedValue({
      data: { data: [{ id: 100, slug: 'fabric-api', name: 'Fabric API' }] },
    });

    const mod = await service.resolveModBySlug('api-key', 'fabric-api');

    expect(mockClient.get).toHaveBeenCalledWith('/mods/search', expect.objectContaining({ params: expect.objectContaining({ slug: 'fabric-api' }) }));
    expect(mod).toMatchObject({ id: 100, slug: 'fabric-api' });
  });

  it('resolveModBySlug should 404 when no mod matches', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });

    await expect(service.resolveModBySlug('api-key', 'unknown-slug')).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});
