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

  getVacancies: () => api.request('GET', '/api/vacancies'),
  createVacancy: (data) => api.request('POST', '/api/vacancies', data),
  getMatches: (id) => api.request('GET', `/api/vacancies/${id}/matches`),

  getOffers: () => api.request('GET', '/api/offers'),
  createOffer: (data) => api.request('POST', '/api/offers', data),
  updateOffer: (id, data) => api.request('PATCH', `/api/offers/${id}`, data),
};