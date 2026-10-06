// Тонкий клиент REST API
const api = {
  async request(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  getCandidates: () => api.request('GET', '/api/candidates'),
  createCandidate: (data) => api.request('POST', '/api/candidates', data),
  getCandidateCategory: (id) => api.request('GET', `/api/candidates/${id}/category`),
  searchCandidates: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== null && v !== undefined && v !== '')
    ).toString();
    return api.request('GET', `/api/candidates/search${qs ? '?' + qs : ''}`);
  },

  getVacancies: () => api.request('GET', '/api/vacancies'),
  createVacancy: (data) => api.request('POST', '/api/vacancies', data),
  getMatches: (id) => api.request('GET', `/api/vacancies/${id}/matches`),

  getOffers: () => api.request('GET', '/api/offers'),
  createOffer: (data) => api.request('POST', '/api/offers', data),
  updateOffer: (id, data) => api.request('PATCH', `/api/offers/${id}`, data),

  getTestingMeta: () => api.request('GET', '/api/testing/meta'),
  startTest: (candidateId, data) => api.request('POST', `/api/candidates/${candidateId}/tests`, data),
  submitTest: (attemptId, answers) => api.request('POST', `/api/test-attempts/${attemptId}/submit`, { answers }),
  getCandidateTests: (candidateId) => api.request('GET', `/api/candidates/${candidateId}/tests`),
  getGradeChangeStatus: (candidateId) => api.request('GET', `/api/candidates/${candidateId}/grade-change-status`),
};