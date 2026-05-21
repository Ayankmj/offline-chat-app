import axios from 'axios';
import {HuggingFaceModel, HuggingFaceModelsResponse, ModelFileDetails, GGUFSpecs} from '../types';

const HF_API_BASE = 'https://huggingface.co/api';
const HF_TIMEOUT = 15000;

export async function fetchModels({
  search,
  author,
  filter,
  sort,
  direction,
  limit,
  full,
  nextPageUrl,
  authToken,
}: {
  search?: string;
  author?: string;
  filter?: string;
  sort?: string;
  direction?: string;
  limit?: number;
  full?: boolean;
  nextPageUrl?: string;
  authToken?: string | null;
}): Promise<HuggingFaceModelsResponse> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const params = nextPageUrl ? undefined : {
    search,
    author,
    filter: filter || 'gguf',
    sort,
    direction,
    limit,
    full,
  };

  const response = await axios.get(nextPageUrl || `${HF_API_BASE}/models`, {
    params,
    headers,
    timeout: HF_TIMEOUT,
  });

  const linkHeader = response.headers['link'] || response.headers['Link'];
  let nextLink = null;
  if (linkHeader) {
    const match = linkHeader.match(/<([^>]*)>;.*rel="next"/);
    if (match) nextLink = match[1];
  }

  return {
    models: response.data as HuggingFaceModel[],
    nextLink,
  };
}

export const fetchModelFilesDetails = async (
  modelId: string,
  authToken?: string | null,
): Promise<ModelFileDetails[]> => {
  const url = `${HF_API_BASE}/models/${modelId}/tree/main?recursive=true`;
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await axios.get(url, {headers, timeout: HF_TIMEOUT});
  return response.data;
};

export const fetchGGUFSpecs = async (
  modelId: string,
  authToken?: string | null,
): Promise<GGUFSpecs> => {
  const url = `${HF_API_BASE}/models/${modelId}/revision/main`;
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await axios.get(url, {headers, timeout: HF_TIMEOUT});
  return response.data;
};

export const fetchModelInfo = async ({
  repoId,
  authToken,
}: {
  repoId: string;
  authToken?: string | null;
}): Promise<Partial<HuggingFaceModel>> => {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await axios.get(`${HF_API_BASE}/models/${repoId}`, {
    params: {full: true},
    headers,
    timeout: HF_TIMEOUT,
  });

  const modelData: Partial<HuggingFaceModel> = {...response.data};

  if (response.data.gguf) {
    modelData.specs = {
      gguf: response.data.gguf,
    };
    delete (modelData as any).gguf;
  }

  return modelData;
};
