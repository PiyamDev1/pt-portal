// Helper: Parse User Agent with Icons
export const getDeviceInfo = (ua: string) => {
  if (!ua) return { name: 'Unknown Device', icon: '💻' }
  
  let icon = '💻'
  let name = 'Unknown Device'
  let browser = ''
  
  // Detect Device Type & Icon
  if (ua.includes('iPhone')) {
    icon = '📱'
    name = 'iPhone'
  } else if (ua.includes('iPad')) {
    icon = '📱'
    name = 'iPad'
  } else if (ua.includes('Android')) {
    if (ua.includes('Mobile')) {
      icon = '📱'
      name = 'Android Phone'
    } else {
      icon = '📱'
      name = 'Android Tablet'
    }
  } else if (ua.includes('Windows')) {
    icon = '🖥️'
    name = 'Windows PC'
  } else if (ua.includes('Macintosh') || ua.includes('Mac OS')) {
    icon = '🖥️'
    name = 'Mac'
  } else if (ua.includes('Linux')) {
    icon = '🖥️'
    name = 'Linux PC'
  } else if (ua.includes('CrOS')) {
    icon = '💻'
    name = 'Chromebook'
  }
  
  // Detect Browser
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera'
  
  if (browser) name += ` (${browser})`

  return { name, icon }
}

// Helper: Password Strength Indicator
export const getPasswordStrengthIndicator = (pwd: string) => {
  const errors = [] as string[]
  if (pwd.length < 8) errors.push('at least 8 characters')
  if (!/[a-z]/.test(pwd)) errors.push('a lowercase letter')
  if (!/[A-Z]/.test(pwd)) errors.push('an uppercase letter')
  if (!/[0-9]/.test(pwd)) errors.push('a number')
  if (!/[!@#$%^&*(),.?":{}|<>\-_=+\\/\[\];']/.test(pwd)) errors.push('a special character')
  const strength = 5 - errors.length
  return { strength, errors }
}

// Helper: Resize & Crop Image to Square
export const resizeImage = (file: File, size: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context failed'))

      canvas.width = size
      canvas.height = size

      const minDim = Math.min(img.width, img.height)
      const startX = (img.width - minDim) / 2
      const startY = (img.height - minDim) / 2

      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size)

      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas conversion failed'))
      }, 'image/png')
    }
    img.onerror = (err) => reject(err as any)
  })
}
