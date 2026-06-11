(function () {
  const IMS_URL = 'https://ims.piyamtravel.com/dashboard'
  const BUTTON_ID = 'piyam-ims-return-button'

  function findNavTarget() {
    return (
      document.querySelector('.navbar .container') ||
      document.querySelector('.navbar .container-fluid') ||
      document.querySelector('.navbar-collapse') ||
      document.querySelector('.navbar')
    )
  }

  function ensureButton() {
    if (document.getElementById(BUTTON_ID)) return

    const target = findNavTarget()
    if (!target) return

    const link = document.createElement('a')
    link.id = BUTTON_ID
    link.href = IMS_URL
    link.textContent = 'Back to IMS'
    link.className = 'btn btn-sm btn-default'
    link.style.marginLeft = '12px'
    link.style.whiteSpace = 'nowrap'
    link.setAttribute('aria-label', 'Back to IMS Portal')

    target.appendChild(link)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton)
  } else {
    ensureButton()
  }

  const observer = new MutationObserver(ensureButton)
  observer.observe(document.documentElement, { childList: true, subtree: true })
})()
