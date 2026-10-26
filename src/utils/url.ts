export function normalizeOrganizationUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed.startsWith('https://')) {
    throw new Error('Organization URL must start with https://');
  }
  return trimmed;
}

export function extractOrganizationName(url: string): string {
  const normalized = normalizeOrganizationUrl(url);
  const devAzureMatch = normalized.match(/dev\.azure\.com\/([^/]+)/i);
  if (devAzureMatch) {
    return devAzureMatch[1];
  }

  const visualstudioMatch = normalized.match(/([^./]+)\.visualstudio\.com/i);
  if (visualstudioMatch) {
    return visualstudioMatch[1];
  }

  throw new Error(
    'Invalid organization URL. Use https://dev.azure.com/your-org or https://your-org.visualstudio.com'
  );
}

export function validateOrganizationUrl(url: string): string | null {
  try {
    extractOrganizationName(url);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid organization URL';
  }
}
