export const SOCIAL_LINKS = [
  { platform: 'instagram', label: 'Instagram', handle: '@dailyaihoroscope', url: 'https://www.instagram.com/dailyaihoroscope/' },
  { platform: 'facebook', label: 'Facebook', handle: '@dailyaihoroscope', url: 'https://www.facebook.com/dailyaihoroscope' },
  { platform: 'bluesky', label: 'Bluesky', handle: '@dailyaihoroscope', url: 'https://bsky.app/profile/dailyaihoroscope.com' }
];

const ICONS = {
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>',
  facebook: '<path d="M15 21v-8h3l.5-4H15V7c0-1.2.4-2 2-2h1.7V1.4C17.9 1.2 16.8 1 15.5 1 12.3 1 10 2.9 10 6.5V9H7v4h3v8z" fill="currentColor" stroke="none"/>',
  bluesky: '<path d="M12 12C9 8 4.4 4.2 2.7 5.1c-1.6.8-.5 5.4 1.5 7.2 1.6 1.5 4 1.6 7.8-.3-3.8 1.9-5.2 3.7-4.6 5.6.6 1.8 2.6 1.8 4.6-2.1 2 3.9 4 3.9 4.6 2.1.6-1.9-.8-3.7-4.6-5.6 3.8 1.9 6.2 1.8 7.8.3 2-1.8 3.1-6.4 1.5-7.2C19.6 4.2 15 8 12 12z"/>'
};

export function followLinks(className = 'follow-icon') {
  return SOCIAL_LINKS.map(({ platform, label, url }) =>
    '<a class="' + className + '" data-platform="' + platform + '" href="' + url +
    '" target="_blank" rel="me noopener noreferrer" aria-label="Follow Daily AI Horoscope on ' + label +
    '" title="' + label + '"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    ICONS[platform] + '</svg></a>'
  ).join('');
}
