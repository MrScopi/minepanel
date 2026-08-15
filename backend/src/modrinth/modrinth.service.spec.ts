import { HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { ModrinthService } from './modrinth.service';

jest.mock('axios');

describe('ModrinthService', () => {
  let service: ModrinthService;
  const mockClient = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue(mockClient);
    service = new ModrinthService();
  });

  it('searchMods should return normalized compatible results', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        hits: [
          {
            project_id: 'A1',
            slug: 'sodium',
            title: 'Sodium',
            description: 'Rendering optimization',
            icon_url: 'https://example.com/sodium.png',
            downloads: 99999,
            date_modified: '2026-01-05T00:00:00Z',
            versions: ['1.20.1', '1.20.2'],
            categories: ['fabric', 'optimization'],
          },
          {
            project_id: 'A2',
            slug: 'forge-only-mod',
            title: 'Forge Only',
            description: 'Forge mod',
            icon_url: 'https://example.com/forge.png',
            downloads: 1200,
            date_modified: '2026-01-06T00:00:00Z',
            versions: ['1.20.1'],
            categories: ['forge'],
          },
        ],
        offset: 0,
        limit: 20,
        total_hits: 2,
      },
    });

    const result = await service.searchMods({
      q: 'performance',
      minecraftVersion: '1.20.1',
      loader: 'fabric',
      limit: 20,
      offset: 0,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      provider: 'modrinth',
      projectId: 'A1',
      slug: 'sodium',
      supportedLoaders: ['fabric'],
    });
  });

  it('searchMods should map upstream axios errors', async () => {
    mockClient.get.mockRejectedValue({
      response: {
        status: 502,
        data: { description: 'Gateway error' },
      },
    });
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);

    await expect(
      service.searchMods({
        minecraftVersion: '1.20.1',
      }),
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      service.searchMods({
        minecraftVersion: '1.20.1',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY });
  });

  it('getProject should return the raw project payload', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        id: 'A1',
        slug: 'sodium',
        title: 'Sodium',
        description: 'Rendering optimization',
        icon_url: 'https://example.com/sodium.png',
        game_versions: ['1.20.1', '1.20.2'],
        loaders: ['fabric'],
        date_modified: '2026-01-05T00:00:00Z',
      },
    });

    const project = await service.getProject('sodium');

    expect(mockClient.get).toHaveBeenCalledWith('/project/sodium');
    expect(project).toMatchObject({ id: 'A1', slug: 'sodium', title: 'Sodium' });
  });

  it('getProject should map a 404 to NotFound', async () => {
    mockClient.get.mockRejectedValue({ response: { status: 404 } });
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);

    await expect(service.getProject('missing')).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it('resolveVersionsForProject should normalize versions and pick the primary file', async () => {
    mockClient.get.mockResolvedValue({
      data: [
        {
          id: 'v2',
          project_id: 'A1',
          version_number: '2.0.0',
          changelog: 'Fixed things',
          date_published: '2026-02-01T00:00:00Z',
          game_versions: ['1.21.4'],
          loaders: ['fabric'],
          files: [
            { url: 'https://example.com/old.jar', filename: 'old.jar', primary: false },
            { url: 'https://example.com/sodium-2.0.0.jar', filename: 'sodium-2.0.0.jar', primary: true },
          ],
          dependencies: [{ project_id: 'fabric-api', dependency_type: 'required' }],
        },
        {
          id: 'v1',
          project_id: 'A1',
          version_number: '1.0.0',
          date_published: '2026-01-01T00:00:00Z',
          game_versions: ['1.20.1'],
          loaders: ['fabric'],
          files: [{ url: 'https://example.com/sodium-1.0.0.jar', filename: 'sodium-1.0.0.jar', primary: true }],
          dependencies: [],
        },
      ],
    });

    const versions = await service.resolveVersionsForProject('sodium');

    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      provider: 'modrinth',
      versionId: 'v2',
      versionNumber: '2.0.0',
      downloadUrl: 'https://example.com/sodium-2.0.0.jar',
      fileName: 'sodium-2.0.0.jar',
      mcVersions: ['1.21.4'],
      dependencies: [{ projectId: 'fabric-api', dependencyType: 'required' }],
    });
  });
});
