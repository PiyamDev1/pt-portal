'use client'

import { Plus, Tag, Trash2 } from 'lucide-react'
import type {
  PackageLimitedTimeOffer,
  PackageQuotePayload,
  PackageVisaPassengerCategory,
} from '@/app/types/packages'
import { PackageSectionHeader as SectionHeader } from './PackageSectionHeader'

export type PackageDiscountOffersModel = {
  payload: PackageQuotePayload
  addLimitedTimeOffer: () => void
  removeLimitedTimeOffer: (offerIndex: number) => void
  updateLimitedTimeOffer: (offerIndex: number, nextOffer: PackageLimitedTimeOffer) => void
  toDateTimeLocalValue: (value: string) => string
  fromDateTimeLocalValue: (value: string) => string
}

export function PackageDiscountOffers({ model }: { model: PackageDiscountOffersModel }) {
  const {
    payload,
    addLimitedTimeOffer,
    removeLimitedTimeOffer,
    updateLimitedTimeOffer,
    toDateTimeLocalValue,
    fromDateTimeLocalValue,
  } = model

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
      <SectionHeader
        icon={Tag}
        title="Discounts and offers"
        action={
          <button
            type="button"
            onClick={addLimitedTimeOffer}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
            title="Add offer"
          >
            <Plus className="h-4 w-4" />
          </button>
        }
      />
      {payload.limitedTimeOffers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">
          No adjustment added. Use the plus button for an Early Bird, Further Discount, previous
          Refund Adjustment, or passenger-specific Visa Special Discount.
        </p>
      ) : (
        <div className="space-y-3">
          {payload.limitedTimeOffers.map((offer, index) => (
            <div key={offer.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={offer.title}
                  onChange={(event) =>
                    updateLimitedTimeOffer(index, { ...offer, title: event.target.value })
                  }
                  placeholder="Offer title"
                  className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                />
                <button
                  type="button"
                  onClick={() => updateLimitedTimeOffer(index, { ...offer, active: !offer.active })}
                  className={`min-h-10 rounded-lg px-3 text-xs font-black transition ${
                    offer.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {offer.active ? 'Active' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => removeLimitedTimeOffer(index)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
                  title="Remove offer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mb-3 grid gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">Discount type</span>
                  <select
                    value={offer.discountType || 'early_bird'}
                    onChange={(event) => {
                      const discountType = event.target.value as NonNullable<
                        PackageLimitedTimeOffer['discountType']
                      >
                      updateLimitedTimeOffer(index, {
                        ...offer,
                        discountType,
                        eligibleServices:
                          discountType === 'visa_special'
                            ? ['visa']
                            : discountType === 'refund_adjustment'
                              ? []
                              : (offer.eligibleServices || []).filter(
                                    (service) => service !== 'visa',
                                  ).length
                                ? (offer.eligibleServices || []).filter(
                                    (service) => service !== 'visa',
                                  )
                                : ['flight', 'hotel', 'transport'],
                        visaOptionId:
                          discountType === 'visa_special'
                            ? offer.visaOptionId || payload.visaOptions[0]?.id || null
                            : null,
                        visaPassengerCategory:
                          discountType === 'visa_special'
                            ? offer.visaPassengerCategory && offer.visaPassengerCategory !== 'all'
                              ? offer.visaPassengerCategory
                              : payload.visaOptions[0]?.visaPassengerCategory &&
                                  payload.visaOptions[0].visaPassengerCategory !== 'all'
                                ? payload.visaOptions[0].visaPassengerCategory
                                : 'adult'
                            : offer.visaPassengerCategory,
                      })
                    }}
                    className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                  >
                    <option value="early_bird">Early Bird offer</option>
                    <option value="general_discount">General Further Discount</option>
                    <option value="refund_adjustment">Previous Refund Adjustment</option>
                    <option value="visa_special">Visa Special Discount</option>
                  </select>
                </label>

                {(offer.discountType || 'early_bird') === 'refund_adjustment' ? (
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-500">
                      Previous package / refund reference
                    </span>
                    <input
                      value={offer.reference || ''}
                      onChange={(event) =>
                        updateLimitedTimeOffer(index, {
                          ...offer,
                          reference: event.target.value,
                        })
                      }
                      placeholder="For example: PT-ABC123 or refund reference"
                      className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                    />
                  </label>
                ) : (offer.discountType || 'early_bird') !== 'visa_special' ? (
                  <fieldset>
                    <legend className="mb-1 text-xs font-bold text-slate-500">
                      Allocate across
                    </legend>
                    <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      {(['flight', 'hotel', 'transport'] as const).map((service) => {
                        const checked = (
                          offer.eligibleServices || ['flight', 'hotel', 'transport']
                        ).includes(service)
                        return (
                          <label
                            key={service}
                            className="inline-flex items-center gap-2 text-xs font-black capitalize text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const current = offer.eligibleServices || [
                                  'flight',
                                  'hotel',
                                  'transport',
                                ]
                                const eligibleServices = event.target.checked
                                  ? [...new Set([...current, service])]
                                  : current.filter((item) => item !== service)
                                if (eligibleServices.length === 0) return
                                updateLimitedTimeOffer(index, {
                                  ...offer,
                                  eligibleServices,
                                })
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-[#8b1e2d]"
                            />
                            {service}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_8rem]">
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">
                        Visa option
                      </span>
                      <select
                        value={offer.visaOptionId || ''}
                        onChange={(event) => {
                          const option = payload.visaOptions.find(
                            (candidate) => candidate.id === event.target.value,
                          )
                          updateLimitedTimeOffer(index, {
                            ...offer,
                            visaOptionId: event.target.value || null,
                            visaPassengerCategory:
                              option?.visaPassengerCategory &&
                              option.visaPassengerCategory !== 'all'
                                ? option.visaPassengerCategory
                                : offer.visaPassengerCategory &&
                                    offer.visaPassengerCategory !== 'all'
                                  ? offer.visaPassengerCategory
                                  : 'adult',
                          })
                        }}
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                      >
                        <option value="">Select visa</option>
                        {payload.visaOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.title || 'Visa option'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">Passenger</span>
                      <select
                        value={offer.visaPassengerCategory || 'all'}
                        onChange={(event) =>
                          updateLimitedTimeOffer(index, {
                            ...offer,
                            visaPassengerCategory: event.target
                              .value as PackageVisaPassengerCategory,
                          })
                        }
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                      >
                        <option value="adult">Adult 12+</option>
                        <option value="child_5_plus">Child 5+</option>
                        <option value="child_2_to_4">Child 2-4</option>
                        <option value="infant">Infant under 2</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-slate-500">Quantity</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={offer.visaQuantity || ''}
                        onChange={(event) =>
                          updateLimitedTimeOffer(index, {
                            ...offer,
                            visaQuantity: Number(event.target.value || 0),
                          })
                        }
                        placeholder="1"
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                      />
                    </label>
                  </div>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">Deadline</span>
                  <input
                    type="datetime-local"
                    value={offer.expiresAt ? toDateTimeLocalValue(offer.expiresAt) : ''}
                    onChange={(event) =>
                      updateLimitedTimeOffer(index, {
                        ...offer,
                        expiresAt: event.target.value
                          ? fromDateTimeLocalValue(event.target.value)
                          : '',
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">
                    {(offer.discountType || 'early_bird') === 'refund_adjustment'
                      ? 'Credit amount'
                      : 'Discount'}
                  </span>
                  <div className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3">
                    <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                    <input
                      value={offer.discountAmount || ''}
                      onChange={(event) =>
                        updateLimitedTimeOffer(index, {
                          ...offer,
                          discountAmount: Number(event.target.value || 0),
                        })
                      }
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full bg-transparent text-sm font-bold outline-none"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">Mode</span>
                  <select
                    value={offer.discountMode}
                    onChange={(event) =>
                      updateLimitedTimeOffer(index, {
                        ...offer,
                        discountMode: event.target.value as PackageLimitedTimeOffer['discountMode'],
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                  >
                    <option value="total">Total</option>
                    <option value="per_person">Per person</option>
                  </select>
                </label>
              </div>
              <textarea
                value={offer.summary}
                onChange={(event) =>
                  updateLimitedTimeOffer(index, { ...offer, summary: event.target.value })
                }
                placeholder="Public offer wording"
                rows={3}
                className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
