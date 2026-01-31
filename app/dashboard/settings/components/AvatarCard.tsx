import Image from 'next/image'

interface AvatarCardProps {
  currentUser: any
  loading: boolean
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function AvatarCard({ currentUser, loading, onUpload }: AvatarCardProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex items-center gap-6">
      <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center text-2xl font-bold text-slate-400 border-2 border-dashed border-slate-300 overflow-hidden relative">
        <Image
          src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${currentUser.id}/avatar.png?t=${new Date().getTime()}`}
          alt="Avatar"
          fill
          sizes="80px"
          className="object-cover"
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement
            target.style.display = 'none'
          }}
          unoptimized
        />
        <span>{currentUser.email?.charAt(0).toUpperCase()}</span>
      </div>
      <div>
        <h3 className="font-bold text-slate-800">Profile Picture</h3>
        <p className="text-sm text-slate-500 mb-3">Upload a new avatar. JPG or PNG.</p>
        <label className="cursor-pointer px-4 py-2 bg-white border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 transition">
          Upload New Picture
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onUpload}
            disabled={loading}
          />
        </label>
      </div>
    </div>
  )
}
