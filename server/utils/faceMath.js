/**
 * Compute Euclidean distance between two 128-d face descriptors.
 */
export function euclideanDistance(descA, descB) {
  if (!Array.isArray(descA) || !Array.isArray(descB) || descA.length !== descB.length) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < descA.length; i += 1) {
    const diff = descA[i] - descB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Convert Euclidean distance into an intuitive 0-100% similarity score.
 */
export function distanceToConfidence(distance) {
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - Math.min(distance, 1.0)) * 100)));
}

/**
 * Find the closest matching user from a list of users with faceDescriptors.
 */
export function findBestFaceMatch(probeDescriptor, users, threshold = 0.52) {
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const user of users) {
    const descriptors = user.faceDescriptors || [];
    for (const storedDesc of descriptors) {
      const dist = euclideanDistance(probeDescriptor, storedDesc);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = user;
      }
    }
  }

  if (bestMatch && bestDistance <= threshold) {
    return {
      matched: true,
      user: bestMatch,
      distance: Number(bestDistance.toFixed(4)),
      confidence: distanceToConfidence(bestDistance),
    };
  }

  return {
    matched: false,
    user: null,
    distance: Number.isFinite(bestDistance) ? Number(bestDistance.toFixed(4)) : null,
    confidence: Number.isFinite(bestDistance) ? distanceToConfidence(bestDistance) : 0,
  };
}
