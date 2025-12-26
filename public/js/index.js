// 1. Add admin with role hierarchy check
await addAdminRole({ email: 'admin@example.com', role: 'support' });

// 2. Remove admin but preserve other claims
await removeAdminRole({ 
  email: 'user@example.com', 
  preserveOtherClaims: true 
});

// 3. Paginate users efficiently
const firstPage = await getAdminUsers({ limit: 50 });
const nextPage = await getAdminUsers({ 
  limit: 50, 
  lastDocId: firstPage.pagination.lastDocId 
});

// 4. Search users (scalable)
const results = await searchUsers({ 
  query: 'user@example.com', 
  field: 'email' 
});
