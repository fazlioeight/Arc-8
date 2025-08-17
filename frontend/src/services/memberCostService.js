// src/services/memberCostService.js
export async function getMemberCosts(memberId) {
  const res = await fetch(`http://localhost:8000/member/${memberId}/costs`);
  if (!res.ok) throw new Error('Failed to fetch member costs');
  return await res.json();
}