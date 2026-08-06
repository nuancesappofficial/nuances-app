import type { UILanguage } from '../services/settings/userSettings';
import { ADDITIONAL_UI_STRINGS } from './uiLanguageAdditional';

export type UIStringKey =
  | 'common.back'
  | 'common.cancel'
  | 'common.close'
  | 'common.done'
  | 'common.free'
  | 'common.premium'
  | 'common.trial'
  | 'common.unknown'
  | 'common.restore'
  | 'common.subscribe'
  | 'common.updating'
  | 'common.unableToOpenLink'
  | 'common.skipTutorial'
  | 'deck.searchPlaceholder'
  | 'deck.noOriginalSentence'
  | 'deck.emptyWordPopTitle'
  | 'deck.emptyWordPopSubtitle'
  | 'deck.newWords'
  | 'deck.quickQuiz'
  | 'deck.searchNoMatches'
  | 'deck.cacheEmpty'
  | 'deck.cacheNotEmpty'
  | 'deck.alertNoWordsTitle'
  | 'deck.alertNoWordsBody'
  | 'deck.alertNoCardsTitle'
  | 'deck.alertNoCardsBody'
  | 'deck.alertAlbumNameEmptyTitle'
  | 'deck.alertAlbumNameEmptyBody'
  | 'deck.alertPhotoPermissionTitle'
  | 'deck.alertPhotoPermissionBody'
  | 'deck.alertPickCoverFailedTitle'
  | 'deck.alertPickCoverFailedBody'
  | 'deck.alertCannotDeleteTitle'
  | 'deck.alertCannotDeleteBody'
  | 'deck.alertDeleteAlbumTitle'
  | 'deck.alertDeleteAlbumBody'
  | 'deck.alertCancel'
  | 'deck.alertDelete'
  | 'deck.tourCompleteTitle'
  | 'deck.tourCompleteBody'
  | 'deck.albumAllCards'
  | 'deck.albumFavorites'
  | 'deck.albumInternetSlang'
  | 'deck.madeForYou'
  | 'deck.play'
  | 'deck.words'
  | 'deck.noWordsAddedThisDay'
  | 'deck.albumMyNuances'
  | 'deck.todayReview'
  | 'deck.allCardsReview'
  | 'cardDetail.context'
  | 'cardDetail.noContext'
  | 'cardDetail.showFullSentence'
  | 'cardDetail.hideFullSentence'
  | 'cardDetail.showFullContent'
  | 'cardDetail.hideFullContent'
  | 'cardDetail.showExampleSentences'
  | 'cardDetail.hideExampleSentences'
  | 'cardDetail.collocation'
  | 'cardDetail.commonUsage'
  | 'cardDetail.semanticRelations'
  | 'cardDetail.exampleSentence'
  | 'cardDetail.personalNotes'
  | 'cardDetail.editNote'
  | 'cardDetail.addNote'
  | 'cardDetail.basics'
  | 'cardDetail.shareScreens'
  | 'cardDetail.front'
  | 'cardDetail.back'
  | 'cardDetail.share'
  | 'cardDetail.cardNote'
  | 'cardDetail.notePlaceholder'
  | 'cardDetail.downloading'
  | 'cache.create'
  | 'cache.skip'
  | 'cache.adding'
  | 'cache.duplicateTitle'
  | 'cache.duplicateMessage'
  | 'cache.deleteAllTitle'
  | 'cache.deleteAllMessage'
  | 'cache.deleteAllConfirm'
  | 'cache.deleteAllFailedTitle'
  | 'cache.deleteAllFailedMessage'
  | 'create.originalImage'
  | 'create.originalContext'
  | 'create.keywords'
  | 'create.ocrRunning'
  | 'create.ocrNoText'
  | 'create.ocrFailed'
  | 'create.editOcrModeAction'
  | 'create.editOcrModeDone'
  | 'create.editOcrModeHint'
  | 'create.editOcrTokenTitle'
  | 'create.editOcrTokenBody'
  | 'create.editOcrTokenCancel'
  | 'create.editOcrTokenSave'
  | 'create.aiDepth'
  | 'create.saveToAlbums'
  | 'create.allCardsOnly'
  | 'create.albumsSelected'
  | 'create.noAlbumsAvailable'
  | 'create.aiMode.clarity'
  | 'create.aiMode.application'
  | 'create.aiMode.mastery'
  | 'create.aiMode.clarityDescription'
  | 'create.aiMode.applicationDescription'
  | 'create.aiMode.masteryDescription'
  | 'create.didYouMean'
  | 'create.didYouMeanBody'
  | 'create.didYouMeanYes'
  | 'create.didYouMeanNo'
  | 'create.didYouMeanCustomPlaceholder'
  | 'create.didYouMeanUseCustom'
  | 'create.selectedWords'
  | 'create.generate'
  | 'create.cards'
  | 'create.card'
  | 'create.addNewCards'
  | 'create.generateFailedTitle'
  | 'create.generateFailedBody'
  | 'create.retry'
  | 'create.save'
  | 'create.saving'
  | 'create.saveErrorTitle'
  | 'create.saveErrorBody'
  | 'create.createAlbumFailedTitle'
  | 'create.createAlbumFailedBody'
  | 'create.albumSettingsTitle'
  | 'create.albumNameTitle'
  | 'create.albumNamePlaceholder'
  | 'create.albumTabClassic'
  | 'create.albumTabImage'
  | 'create.albumIcon'
  | 'create.albumCoverColor'
  | 'create.albumCancel'
  | 'create.albumCreate'
  | 'create.albumSave'
  | 'create.pronunciationCoachTitle'
  | 'create.pronunciationSaveFirstBody'
  | 'create.noSpeakableContentTitle'
  | 'create.noSpeakableContentBody'
  | 'create.noCardsSelectedTitle'
  | 'create.noCardsSelectedBody'
  | 'create.uploadImageErrorUnauthed'
  | 'create.uploadImageErrorNoBase64'
  | 'create.uploadImageErrorEmptyBytes'
  | 'create.uploadImageErrorSignedUrl'
  | 'create.definitionFallback'
  | 'create.ghostStatusExtracting'
  | 'create.ghostStatusAnalyzing'
  | 'create.ghostStatusStructuring'
  | 'create.ghostStatusFinalizing'
  | 'profile.membership'
  | 'profile.defaultTitle'
  | 'profile.settingsTitle'
  | 'profile.settingsSubtitle'
  | 'profile.uploadProfilePic'
  | 'profile.feedback'
  | 'profile.rateApp'
  | 'profile.messageDeveloper'
  | 'profile.messageDeveloperMeta'
  | 'profile.feedbackEmailSubject'
  | 'profile.feedbackEmailBody'
  | 'profile.legal'
  | 'profile.privacyPolicy'
  | 'profile.termsOfService'
  | 'profile.mainScreen'
  | 'profile.language'
  | 'profile.appearance'
  | 'profile.voice'
  | 'profile.font'
  | 'profile.reminders'
  | 'profile.remindersOn'
  | 'profile.remindersOff'
  | 'profile.replayTutorial'
  | 'profile.deleteAccount'
  | 'profile.deleteAccountDeleting'
  | 'profile.deleteAccountConfirmTitle'
  | 'profile.deleteAccountConfirmBody'
  | 'profile.deleteAccountConfirmCancel'
  | 'profile.deleteAccountConfirmDelete'
  | 'profile.deleteAccountFailedTitle'
  | 'profile.deleteAccountFailedBody'
  | 'profile.menuTitle'
  | 'profile.menuBody'
  | 'profile.devOverrideUpdatedTitle'
  | 'profile.devOverrideUpdatedBody'
  | 'profile.devOverrideFailedTitle'
  | 'profile.devOverrideFailedBody'
  | 'profile.mainScreenSummary.wordPopOn'
  | 'profile.mainScreenSummary.wordPopOff'
  | 'settings.title.language'
  | 'settings.title.voice'
  | 'settings.title.mainScreen'
  | 'settings.title.membership'
  | 'settings.title.appearance'
  | 'settings.title.font'
  | 'settings.theme.system'
  | 'settings.theme.light'
  | 'settings.theme.dark'
  | 'settings.theme.updateFailedTitle'
  | 'settings.theme.updateFailedBody'
  | 'settings.font.wordSize'
  | 'settings.language.subtitle'
  | 'settings.language.replyTitle'
  | 'settings.language.replySubtitle'
  | 'settings.language.imageTextTitle'
  | 'settings.language.imageTextSubtitle'
  | 'settings.language.imageTextAuto'
  | 'settings.language.imageTextAutoMeta'
  | 'settings.language.imageTextPreferred'
  | 'settings.language.imageTextPreferredMeta'
  | 'settings.language.imageTextChinese'
  | 'settings.language.imageTextEnglish'
  | 'settings.language.imageTextKorean'
  | 'settings.language.imageTextJapanese'
  | 'settings.language.imageTextSpanish'
  | 'settings.language.english'
  | 'settings.language.chineseTraditional'
  | 'settings.language.chineseSimplified'
  | 'settings.language.japanese'
  | 'settings.language.korean'
  | 'settings.language.spanish'
  | 'settings.language.french'
  | 'settings.language.englishMeta'
  | 'settings.language.chineseTraditionalMeta'
  | 'settings.language.chineseSimplifiedMeta'
  | 'settings.language.restartTitle'
  | 'settings.language.restartBody'
  | 'settings.language.updateFailedTitle'
  | 'settings.language.updateFailedBody'
  | 'settings.main.albumReorderInstruction'
  | 'settings.main.albumsPerPage'
  | 'settings.main.perPageSuffix'
  | 'settings.main.wordPop'
  | 'settings.main.wordPopMeta'
  | 'settings.main.wordPopSource'
  | 'settings.main.wordPopSourceMeta'
  | 'settings.membership.feature.aiCards'
  | 'settings.membership.feature.voiceCache'
  | 'settings.membership.feature.pronunciation'
  | 'settings.membership.tier.lite'
  | 'settings.membership.tier.pro'
  | 'settings.membership.feature.lite.aiCards'
  | 'settings.membership.feature.lite.voiceCache'
  | 'settings.membership.feature.lite.review'
  | 'settings.membership.feature.pro.aiCards'
  | 'settings.membership.feature.pro.voiceCache'
  | 'settings.membership.feature.pro.speed'
  | 'settings.membership.badge.save'
  | 'settings.membership.upsell.title'
  | 'settings.membership.upsell.body'
  | 'settings.membership.upsell.cta'
  | 'settings.membership.fairUseSummary'
  | 'settings.membership.fairUseFooter'
  | 'settings.membership.trialReminder'
  | 'settings.membership.renewalDisclosure'
  | 'settings.membership.manageSubscription'
  | 'settings.membership.manageSubscriptionMeta'
  | 'settings.membership.plan.weekly'
  | 'settings.membership.plan.monthly'
  | 'settings.membership.plan.yearly'
  | 'settings.membership.plan.monthlyEquivalent'
  | 'settings.membership.plan.billedWeekly'
  | 'settings.membership.plan.billedMonthly'
  | 'settings.membership.plan.billedYearly'
  | 'settings.membership.autoRenews'
  | 'settings.membership.back'
  | 'settings.membership.restore'
  | 'settings.membership.subscribe'
  | 'settings.membership.updating'
  | 'settings.membership.active'
  | 'settings.membership.welcomeTitle'
  | 'settings.membership.welcomeBody'
  | 'settings.membership.notSignedInTitle'
  | 'settings.membership.notSignedInBody'
  | 'settings.membership.purchasePendingSyncTitle'
  | 'settings.membership.purchasePendingSyncBody'
  | 'settings.membership.purchaseFailedTitle'
  | 'settings.membership.purchaseFailedBody'
  | 'settings.membership.restoreNoSubscriptionTitle'
  | 'settings.membership.restoreNoSubscriptionBody'
  | 'settings.membership.restoreFailedTitle'
  | 'settings.membership.restoreFailedBody'
  | 'sort.eyebrow'
  | 'sort.title'
  | 'sort.recentlyAdded'
  | 'sort.recentlyReviewed'
  | 'sort.alphabetical'
  | 'sort.currentPrefix'
  | 'review.tuningEyebrow'
  | 'review.tuningTitle'
  | 'review.questionsLabel'
  | 'review.todayNewWordsOnly'
  | 'review.questionTypes'
  | 'review.selectAllQuestionTypes'
  | 'review.sourceAlbums'
  | 'review.questionType.fillBlank'
  | 'review.questionType.spelling'
  | 'review.questionType.guessWord'
  | 'review.questionType.guessMeaning'
  | 'review.questionType.contextMeaning'
  | 'review.questionType.partOfSpeech'
  | 'review.questionType.pronunciation'
  | 'cardAction.eyebrow'
  | 'cardAction.title'
  | 'cardAction.delete'
  | 'albumSheet.addToAlbum'
  | 'albumSheet.done'
  | 'albumSheet.createNewAlbum'
  | 'albumSheet.cardCountSuffix'
  | 'cache.inputLabel'
  | 'cache.inputPlaceholder'
  | 'cache.addToCache'
  | 'cache.tabText'
  | 'cache.tabImage'
  | 'cache.upload'
  | 'cache.imageLabel'
  | 'cache.uploadImage'
  | 'cache.processingImage'
  | 'cache.clear'
  | 'cache.paste'
  | 'cache.add'
  | 'cache.todayUploads'
  | 'cache.noUploadsToday'
  | 'cropper.title'
  | 'cropper.helper'
  | 'cropper.processing'
  | 'cropper.failedTitle'
  | 'cropper.failedBody'
  | 'camera.permissionRequired'
  | 'appVersion.updateUnavailableTitle'
  | 'appVersion.updateUnavailableNoUrl'
  | 'appVersion.updateUnavailableOpenFailed'
  | 'appVersion.updateRequiredTitle'
  | 'appVersion.updateAvailableTitle'
  | 'appVersion.updateRequiredBody'
  | 'appVersion.updateAvailableBody'
  | 'appVersion.updateAction'
  | 'appVersion.laterAction'
  | 'auth.connecting'
  | 'auth.continueWithApple'
  | 'auth.continueWithGoogle'
  | 'onboarding.question.learningLanguages'
  | 'onboarding.question.captureHabit'
  | 'onboarding.question.stumbleContext'
  | 'onboarding.question.breakdownDepth'
  | 'onboarding.option.screenshot'
  | 'onboarding.option.notes'
  | 'onboarding.option.search'
  | 'onboarding.option.reading'
  | 'onboarding.option.listening'
  | 'onboarding.option.watching'
  | 'onboarding.option.quick'
  | 'onboarding.option.detailed'
  | 'onboarding.option.deepDive'
  | 'onboarding.subtitle'
  | 'onboarding.continue'
  | 'onboarding.start'
  | 'onboarding.saving'
  | 'onboarding.errorTitle'
  | 'onboarding.errorSave'
  | 'review.prompt.chooseWord'
  | 'review.prompt.fillBlank'
  | 'review.prompt.spelling'
  | 'review.prompt.chooseTranslation'
  | 'review.prompt.chooseSentenceMeaning'
  | 'review.prompt.choosePartOfSpeech'
  | 'review.prompt.pronounceWord'
  | 'review.playPronunciation'
  | 'review.pronunciationHint'
  | 'review.scoring'
  | 'review.stopAndScore'
  | 'review.recordPronunciation'
  | 'review.cantSpeakNow'
  | 'review.spellingPlaceholder'
  | 'review.submitSpelling'
  | 'review.wordTranslation'
  | 'review.sentence'
  | 'review.translation'
  | 'review.answer'
  | 'review.cardDetail'
  | 'review.correct'
  | 'review.notQuite'
  | 'review.yourScore'
  | 'review.yourAnswer'
  | 'review.testMeNextTime'
  | 'review.next'
  | 'review.finalScore'
  | 'review.cardProgress'
  | 'review.preparing'
  | 'review.prepareFailedTitle'
  | 'review.prepareFailedBody'
  | 'review.noCardsTitle'
  | 'review.noCardsBody'
  | 'review.percentCorrect'
  | 'review.summaryOutstanding'
  | 'review.summaryGoodEffort'
  | 'review.summaryGreatJob'
  | 'review.skippedPronunciation'
  | 'review.playAgain'
  | 'review.done'
  | 'review.micPermissionRequired'
  | 'review.recordingMissing'
  | 'review.recordingTooShort'
  | 'review.recordingInvalidFormat'
  | 'review.assessFailed'
  | 'review.recordFailed'
  | 'pronunciation.coach'
  | 'pronunciation.listening'
  | 'pronunciation.secondsLeft'
  | 'pronunciation.secondsMax'
  | 'pronunciation.preparingScore'
  | 'pronunciation.analysisFailed'
  | 'pronunciation.tapMicRetry'
  | 'pronunciation.status.listeningWaveform'
  | 'pronunciation.status.mappingPhonemes'
  | 'pronunciation.status.comparingTiming'
  | 'pronunciation.status.scoring'
  | 'pronunciation.pass'
  | 'pronunciation.fail'
  | 'pronunciation.showAllSounds'
  | 'pronunciation.showFewerSounds'
  | 'pronunciation.ipaUnavailable'
  | 'pronunciation.ipaLookupFailed'
  | 'pronunciation.reloadIpa';

const STRINGS: Record<'en' | 'zh-TW' | 'zh-CN', Record<UIStringKey, string>> = {
  en: {
    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.done': 'Done',
    'common.free': 'Not subscribed',
    'common.premium': 'Premium',
    'common.trial': 'Trial',
    'common.unknown': 'Unknown',
    'common.restore': 'Restore',
    'common.subscribe': 'Subscribe',
    'common.updating': 'Updating...',
    'common.unableToOpenLink': 'Unable to open link.',
    'common.skipTutorial': 'Skip tutorial',
    'deck.searchPlaceholder': 'Search cards, albums, notes...',
    'deck.noOriginalSentence': 'No original sentence yet.',
    'deck.emptyWordPopTitle': 'Start adding cards to generate words',
    'deck.emptyWordPopSubtitle': 'Tap to open card details',
    'deck.newWords': 'New words',
    'deck.quickQuiz': 'Quick quiz',
    'deck.searchNoMatches': 'No matching words',
    'deck.cacheEmpty': 'Cache is empty',
    'deck.cacheNotEmpty': "Cache isn't empty",
    'deck.alertNoWordsTitle': 'No words yet',
    'deck.alertNoWordsBody': 'Add a few cards before starting Quick quiz.',
    'deck.alertNoCardsTitle': 'No cards available',
    'deck.alertNoCardsBody': 'Add or sync cards before trying again.',
    'deck.alertAlbumNameEmptyTitle': 'Album name required',
    'deck.alertAlbumNameEmptyBody': 'Please enter an album name.',
    'deck.alertPhotoPermissionTitle': 'Photo access needed',
    'deck.alertPhotoPermissionBody':
      'Please allow photo access to choose a cover image.',
    'deck.alertPickCoverFailedTitle': 'Could not choose image',
    'deck.alertPickCoverFailedBody':
      'Unable to choose a cover image. Please try again later.',
    'deck.alertCannotDeleteTitle': 'Cannot delete',
    'deck.alertCannotDeleteBody': 'Default albums cannot be deleted.',
    'deck.alertDeleteAlbumTitle': 'Delete album',
    'deck.alertDeleteAlbumBody': 'Are you sure you want to delete this album?',
    'deck.alertCancel': 'Cancel',
    'deck.alertDelete': 'Delete',
    'deck.tourCompleteTitle': 'Now it’s your turn',
    'deck.tourCompleteBody': 'Upload something you want to learn, or send text and images to Nuances from the iOS Share Sheet.',
    'deck.albumAllCards': 'All cards',
    'deck.albumFavorites': 'My Favorites',
    'deck.albumInternetSlang': 'Internet Slang',
    'deck.madeForYou': 'Made for You',
    'deck.play': 'Quiz',
    'deck.words': 'words',
    'deck.noWordsAddedThisDay': 'No words added this day',
    'deck.albumMyNuances': 'My Nuances',
    'deck.todayReview': 'Today Review',
    'deck.allCardsReview': 'All cards',
    'cardDetail.context': 'Context',
    'cardDetail.noContext': 'No context yet.',
    'cardDetail.showFullSentence': 'View full sentence',
    'cardDetail.hideFullSentence': 'Hide full sentence',
    'cardDetail.showFullContent': 'View full content',
    'cardDetail.hideFullContent': 'Hide full content',
    'cardDetail.showExampleSentences': 'View all examples',
    'cardDetail.hideExampleSentences': 'Hide extra examples',
    'cardDetail.collocation': 'Collocation',
    'cardDetail.commonUsage': 'Common usage',
    'cardDetail.semanticRelations': 'Synonyms & antonyms',
    'cardDetail.exampleSentence': 'Example sentence',
    'cardDetail.personalNotes': 'Personal notes',
    'cardDetail.editNote': 'Edit note',
    'cardDetail.addNote': 'Add a note',
    'cardDetail.basics': 'Basics',
    'cardDetail.shareScreens': 'Share screens',
    'cardDetail.front': 'Front',
    'cardDetail.back': 'Back',
    'cardDetail.share': 'Share',
    'cardDetail.cardNote': 'Card note',
    'cardDetail.notePlaceholder': 'Write your sticky note...',
    'cardDetail.downloading': 'downloading...',
    'cache.create': 'Create',
    'cache.skip': 'Skip',
    'cache.adding': 'Adding...',
    'cache.duplicateTitle': 'Already added',
    'cache.duplicateMessage':
      'This exact text is already waiting in your cache.',
    'cache.deleteAllTitle': 'Delete all cached items?',
    'cache.deleteAllMessage':
      'This permanently deletes all {count} items waiting in your cache.',
    'cache.deleteAllConfirm': 'Delete all',
    'cache.deleteAllFailedTitle': 'Could not delete items',
    'cache.deleteAllFailedMessage': 'Please try again later.',
    'create.originalImage': 'Original Image',
    'create.originalContext': 'Original Context',
    'create.keywords': 'Keywords',
    'create.ocrRunning': 'Reading text...',
    'create.ocrNoText': 'No readable text found.',
    'create.ocrFailed': 'Text reading failed. Using original content.',
    'create.editOcrModeAction': 'Fix text',
    'create.editOcrModeDone': 'Done',
    'create.editOcrModeHint': 'Tap a word to correct it.',
    'create.editOcrTokenTitle': 'Fix recognized text',
    'create.editOcrTokenBody': 'Correct the word before generating the card.',
    'create.editOcrTokenCancel': 'Cancel',
    'create.editOcrTokenSave': 'Save',
    'create.aiDepth': 'AI depth',
    'create.saveToAlbums': 'Save this batch to',
    'create.allCardsOnly': 'All cards only',
    'create.albumsSelected': 'albums selected',
    'create.noAlbumsAvailable': 'No albums available yet',
    'create.aiMode.clarity': 'Quick',
    'create.aiMode.application': 'Detailed',
    'create.aiMode.mastery': 'Deep Dive',
    'create.aiMode.clarityDescription': 'Fast and clean.',
    'create.aiMode.applicationDescription': 'More examples.',
    'create.aiMode.masteryDescription': 'Most detail.',
    'create.didYouMean': 'Did you mean',
    'create.didYouMeanBody': 'AI noticed a possible spelling fix.',
    'create.didYouMeanYes': 'Yes',
    'create.didYouMeanNo': 'No',
    'create.didYouMeanCustomPlaceholder': 'Another word',
    'create.didYouMeanUseCustom': 'Use',
    'create.selectedWords': 'selected',
    'create.generate': 'Generate',
    'create.cards': 'Cards',
    'create.card': 'Card',
    'create.addNewCards': 'Create New Cards',
    'create.generateFailedTitle': 'Could not create',
    'create.generateFailedBody':
      'Unable to generate this card. Please try again.',
    'create.retry': 'Retry',
    'create.save': 'Save',
    'create.saving': 'Saving...',
    'create.saveErrorTitle': 'Error',
    'create.saveErrorBody': 'Failed to save card. Please try again later.',
    'create.createAlbumFailedTitle': 'Could not create album',
    'create.createAlbumFailedBody':
      'Something went wrong while creating this album. Please try again.',
    'create.albumSettingsTitle': 'Album settings',
    'create.albumNameTitle': 'Album name',
    'create.albumNamePlaceholder': 'Type album name',
    'create.albumTabClassic': 'Classic',
    'create.albumTabImage': 'Image',
    'create.albumIcon': 'Icon',
    'create.albumCoverColor': 'Cover color',
    'create.albumCancel': 'Cancel',
    'create.albumCreate': 'Create',
    'create.albumSave': 'Save',
    'create.pronunciationCoachTitle': 'Pronunciation Coach',
    'create.pronunciationSaveFirstBody':
      'Save this card first, then you can practice pronunciation from the card detail screen.',
    'create.noSpeakableContentTitle': 'Nothing to pronounce',
    'create.noSpeakableContentBody':
      'This card does not have text available for pronunciation.',
    'create.noCardsSelectedTitle': 'Nothing selected',
    'create.noCardsSelectedBody':
      'Choose at least one card to add to your deck.',
    'create.uploadImageErrorUnauthed':
      'Please sign in before uploading images.',
    'create.uploadImageErrorNoBase64':
      'Image conversion failed: unable to read base64.',
    'create.uploadImageErrorEmptyBytes':
      'Image conversion failed: byte content is empty.',
    'create.uploadImageErrorSignedUrl':
      'Image uploaded, but a readable signed URL could not be created.',
    'create.definitionFallback': 'Definition pending',
    'create.ghostStatusExtracting': 'Extracting vocabulary...',
    'create.ghostStatusAnalyzing': 'Analyzing linguistic context...',
    'create.ghostStatusStructuring': 'Structuring flashcard...',
    'create.ghostStatusFinalizing': 'Finalizing translations...',
    'profile.membership': 'Membership',
    'profile.defaultTitle': 'Profile',
    'profile.settingsTitle': 'Settings',
    'profile.settingsSubtitle':
      'Personalize your profile and AI response language.',
    'profile.uploadProfilePic': 'Upload profile pic',
    'profile.feedback': 'Feedback',
    'profile.rateApp': 'Rate Nuances',
    'profile.messageDeveloper': 'Report a problem',
    'profile.messageDeveloperMeta': 'Email support with feedback or issues.',
    'profile.feedbackEmailSubject': 'Nuances feedback',
    'profile.feedbackEmailBody':
      'Hi Nuances team,\n\nI wanted to share this feedback:\n\n\n\nDevice:\nWhat happened:',
    'profile.legal': 'Legal',
    'profile.privacyPolicy': 'Privacy Policy',
    'profile.termsOfService': 'Terms of Service',
    'profile.mainScreen': 'Main screen',
    'profile.language': 'Language',
    'profile.appearance': 'Appearance',
    'profile.voice': 'Voice',
    'profile.font': 'Font',
    'profile.reminders': 'Reminders',
    'profile.remindersOn': 'Morning & evening',
    'profile.remindersOff': 'Off',
    'profile.replayTutorial': 'Replay tutorial',
    'profile.deleteAccount': 'Delete Account',
    'profile.deleteAccountDeleting': 'Deleting...',
    'profile.deleteAccountConfirmTitle': 'Delete Account',
    'profile.deleteAccountConfirmBody':
      'Are you sure you want to permanently delete your account? All your vocabulary cards, settings, and personal data will be erased. This action cannot be undone.',
    'profile.deleteAccountConfirmCancel': 'Cancel',
    'profile.deleteAccountConfirmDelete': 'Delete',
    'profile.deleteAccountFailedTitle': 'Delete failed',
    'profile.deleteAccountFailedBody':
      'Failed to delete account. Please try again or contact support.',
    'profile.menuTitle': 'Profile',
    'profile.menuBody': 'More menu features can be added later.',
    'profile.devOverrideUpdatedTitle': 'Dev override updated',
    'profile.devOverrideUpdatedBody': 'Current plan is now {plan}.',
    'profile.devOverrideFailedTitle': 'Dev override failed',
    'profile.devOverrideFailedBody': 'Please try again.',
    'profile.mainScreenSummary.wordPopOn': 'Word pop on',
    'profile.mainScreenSummary.wordPopOff': 'Word pop off',
    'settings.title.language': 'Language',
    'settings.title.voice': 'Voice',
    'settings.title.mainScreen': 'Main screen',
    'settings.title.membership': 'Membership',
    'settings.title.appearance': 'Appearance',
    'settings.title.font': 'Font',
    'settings.theme.system': 'Automatic',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.theme.updateFailedTitle': 'Couldn’t update appearance',
    'settings.theme.updateFailedBody': 'Please try again.',
    'settings.font.wordSize': 'Word sticker size',
    'settings.language.subtitle':
      'Controls both app UI language and AI reply language.',
    'settings.language.replyTitle': 'App & reply language',
    'settings.language.replySubtitle':
      'Changes the app interface, AI replies, and notifications. Pronunciation stays in English.',
    'settings.language.imageTextTitle': 'Text in images',
    'settings.language.imageTextSubtitle':
      'Choose how Nuances recognizes text in images.',
    'settings.language.imageTextAuto': 'Detect automatically',
    'settings.language.imageTextAutoMeta':
      'Recommended. Nuances chooses the best available recognition language.',
    'settings.language.imageTextPreferred': 'Choose preferred languages',
    'settings.language.imageTextPreferredMeta':
      'Prioritize the languages you scan most often. Other languages may still be recognized.',
    'settings.language.imageTextChinese': 'Chinese (Traditional & Simplified)',
    'settings.language.imageTextEnglish': 'English',
    'settings.language.imageTextKorean': 'Korean',
    'settings.language.imageTextJapanese': 'Japanese',
    'settings.language.imageTextSpanish': 'Spanish',
    'settings.language.english': 'English',
    'settings.language.chineseTraditional': 'Traditional Chinese',
    'settings.language.chineseSimplified': 'Simplified Chinese',
    'settings.language.japanese': 'Japanese',
    'settings.language.korean': 'Korean',
    'settings.language.spanish': 'Spanish',
    'settings.language.french': 'French',
    'settings.language.englishMeta': 'UI and AI replies use English.',
    'settings.language.chineseTraditionalMeta':
      'UI and AI replies use Traditional Chinese.',
    'settings.language.chineseSimplifiedMeta':
      'UI and AI replies use Simplified Chinese.',
    'settings.language.restartTitle': 'Language updated',
    'settings.language.restartBody':
      'Fully close and reopen Nuances to apply the language everywhere.',
    'settings.language.updateFailedTitle': 'Update failed',
    'settings.language.updateFailedBody':
      'Unable to save language settings. Please try again later.',
    'settings.main.albumReorderInstruction': 'Hold and drag',
    'settings.main.albumsPerPage': 'Albums per page',
    'settings.main.perPageSuffix': 'per page',
    'settings.main.wordPop': 'Word pop',
    'settings.main.wordPopMeta': 'Show section on main screen',
    'settings.main.wordPopSource': 'Word pop source',
    'settings.main.wordPopSourceMeta':
      'Choose which album feeds the slideshow.',
    'settings.membership.feature.aiCards': 'AI card generation',
    'settings.membership.feature.voiceCache': 'Premium voice cache',
    'settings.membership.feature.pronunciation': 'Pronunciation scoring',
    'settings.membership.tier.lite': 'Nuances LITE',
    'settings.membership.tier.pro': 'Nuances PRO',
    'settings.membership.feature.lite.aiCards': 'AI card generation (200 / month)',
    'settings.membership.feature.lite.voiceCache': 'Pronunciation scoring (300 / month)',
    'settings.membership.feature.lite.review': 'Full review & memory algorithm',
    'settings.membership.feature.pro.aiCards': 'High-volume AI cards (800 / month)',
    'settings.membership.feature.pro.voiceCache': 'Pronunciation scoring (1,200 / month)',
    'settings.membership.feature.pro.speed': 'Priority speed & full advanced access',
    'settings.membership.badge.save': 'Save 35% · Best value',
    'settings.membership.upsell.title': 'You hit your LITE limit',
    'settings.membership.upsell.body': 'Upgrade to PRO for 4× more AI cards, advanced pronunciation, and priority speed.',
    'settings.membership.upsell.cta': 'Upgrade to PRO',
    'settings.membership.fairUseSummary':
      'Fair-use access to AI, voice, and pronunciation.',
    'settings.membership.fairUseFooter':
      'AI, voice, and pronunciation features are subject to fair-use limits.',
    'settings.membership.trialReminder':
      'Payment is charged when you confirm your subscription.',
    'settings.membership.renewalDisclosure':
      'Payment is charged immediately. Auto-renews unless canceled at least 24 hours before renewal.',
    'settings.membership.manageSubscription': 'Manage or cancel subscription',
    'settings.membership.manageSubscriptionMeta':
      'Opens Apple subscription settings.',
    'settings.membership.plan.weekly': 'Weekly',
    'settings.membership.plan.monthly': 'Monthly',
    'settings.membership.plan.yearly': 'Yearly',
    'settings.membership.plan.monthlyEquivalent': '≈ {amount}/month',
    'settings.membership.plan.billedWeekly': 'Billed weekly',
    'settings.membership.plan.billedMonthly': 'Billed monthly',
    'settings.membership.plan.billedYearly': 'Billed yearly',
    'settings.membership.autoRenews': 'Auto-renews unless canceled',
    'settings.membership.back': 'Back',
    'settings.membership.restore': 'Restore',
    'settings.membership.subscribe': 'Subscribe',
    'settings.membership.updating': 'Updating...',
    'settings.membership.active': 'Premium active',
    'settings.membership.welcomeTitle': 'Welcome to Premium',
    'settings.membership.welcomeBody':
      'Nuances Pro is ready. AI cards, voices, and coaching are unlocked.',
    'settings.membership.notSignedInTitle': 'Not signed in',
    'settings.membership.notSignedInBody':
      'Please sign in first, then upgrade to Premium.',
    'settings.membership.purchasePendingSyncTitle': 'Upgrade completed',
    'settings.membership.purchasePendingSyncBody':
      'The purchase finished, but Premium has not synced yet. Please try again later or restore purchases.',
    'settings.membership.purchaseFailedTitle': 'Upgrade failed',
    'settings.membership.purchaseFailedBody': 'Please try again later.',
    'settings.membership.restoreNoSubscriptionTitle': 'Restore completed',
    'settings.membership.restoreNoSubscriptionBody':
      'No valid Premium subscription could be restored right now.',
    'settings.membership.restoreFailedTitle': 'Restore failed',
    'settings.membership.restoreFailedBody': 'Please try again later.',
    'sort.eyebrow': 'Sort options',
    'sort.title': 'Sort by',
    'sort.recentlyAdded': 'Recently added',
    'sort.recentlyReviewed': 'Recently reviewed',
    'sort.alphabetical': 'Alphabetical',
    'sort.currentPrefix': 'Current:',
    'review.tuningEyebrow': 'Review tuning',
    'review.tuningTitle': 'Questions',
    'review.questionsLabel': 'questions',
    'review.todayNewWordsOnly': "Today's new words only",
    'review.questionTypes': 'Question types',
    'review.selectAllQuestionTypes': 'All',
    'review.sourceAlbums': 'Quiz sources',
    'review.questionType.fillBlank': 'Fill the Blank',
    'review.questionType.spelling': 'Spell the Word',
    'review.questionType.guessWord': 'Guess the Word',
    'review.questionType.guessMeaning': 'Translation',
    'review.questionType.contextMeaning': 'Meaning in Context',
    'review.questionType.partOfSpeech': 'Part of Speech',
    'review.questionType.pronunciation': 'Pronunciation',
    'cardAction.eyebrow': 'Card options',
    'cardAction.title': 'Card options',
    'cardAction.delete': 'Delete',
    'albumSheet.addToAlbum': 'Add to Album',
    'albumSheet.done': 'Done',
    'albumSheet.createNewAlbum': 'Create New Album',
    'albumSheet.cardCountSuffix': 'cards',
    'cache.inputLabel': 'Paste or type text',
    'cache.inputPlaceholder':
      'Paste a sentence containing slang, idioms, or expressions...',
    'cache.addToCache': 'Add to cache',
    'cache.tabText': 'Text',
    'cache.tabImage': 'Image',
    'cache.upload': 'Upload',
    'cache.imageLabel': 'Capture or upload image',
    'cache.uploadImage': 'upload image',
    'cache.processingImage': 'processing image...',
    'cache.clear': 'Clear',
    'cache.paste': 'Paste',
    'cache.add': 'Add',
    'cache.todayUploads': "Today's Uploads",
    'cache.noUploadsToday': 'No uploads today',
    'cropper.title': 'Crop image',
    'cropper.helper': 'Drag and zoom',
    'cropper.processing': 'Processing...',
    'cropper.failedTitle': 'Crop failed',
    'cropper.failedBody': 'Please try again.',
    'camera.permissionRequired': 'Camera access is needed to take a photo.',
    'appVersion.updateUnavailableTitle': 'Update unavailable',
    'appVersion.updateUnavailableNoUrl':
      'The App Store update link is not configured yet.',
    'appVersion.updateUnavailableOpenFailed':
      'Unable to open the App Store update page. Please try again later.',
    'appVersion.updateRequiredTitle': 'Update required',
    'appVersion.updateAvailableTitle': 'Update available',
    'appVersion.updateRequiredBody':
      'Please update Nuances from the App Store to continue using the latest supported version.',
    'appVersion.updateAvailableBody':
      'A newer version of Nuances is available. Update from the App Store for the latest fixes and improvements.',
    'appVersion.updateAction': 'Update App',
    'appVersion.laterAction': 'Later',
    'auth.connecting': 'Connecting...',
    'auth.continueWithApple': 'Continue with Apple',
    'auth.continueWithGoogle': 'Continue with Google',
    'onboarding.question.learningLanguages':
      'Which language should Nuances use for explanations?',
    'onboarding.question.captureHabit':
      'What do you do when you find an unfamiliar word?',
    'onboarding.question.stumbleContext': 'Where do you find unfamiliar words?',
    'onboarding.question.breakdownDepth': 'How detailed should explanations be?',
    'onboarding.option.screenshot': 'Screenshot',
    'onboarding.option.notes': 'Notes',
    'onboarding.option.search': 'Search',
    'onboarding.option.reading': 'Reading',
    'onboarding.option.listening': 'Listening',
    'onboarding.option.watching': 'Watching',
    'onboarding.option.quick': 'Quick',
    'onboarding.option.detailed': 'Detailed',
    'onboarding.option.deepDive': 'Deep Dive',
    'onboarding.subtitle': 'Pick anything that fits.',
    'onboarding.continue': 'Continue',
    'onboarding.start': 'Start Nuances',
    'onboarding.saving': 'Saving...',
    'onboarding.errorTitle': 'Onboarding failed',
    'onboarding.errorSave': 'Unable to save onboarding data. Please try again.',
    'review.prompt.chooseWord': 'Choose the correct word',
    'review.prompt.fillBlank': 'Choose the word that completes the blank',
    'review.prompt.spelling': 'Type the word that completes the blank',
    'review.prompt.chooseTranslation': 'Choose the correct translation',
    'review.prompt.chooseSentenceMeaning':
      'Choose the meaning used in this sentence',
    'review.prompt.choosePartOfSpeech': 'Choose the correct part of speech',
    'review.prompt.pronounceWord': 'Pronounce the word',
    'review.playPronunciation': 'Play pronunciation',
    'review.pronunciationHint':
      'Say this word clearly. Accuracy over 60% passes.',
    'review.scoring': 'Scoring...',
    'review.stopAndScore': 'Stop and score',
    'review.recordPronunciation': 'Record pronunciation',
    'review.cantSpeakNow': "Can't speak now",
    'review.spellingPlaceholder': 'Type the missing word',
    'review.submitSpelling': 'Check spelling',
    'review.wordTranslation': 'Word meaning',
    'review.sentence': 'Sentence',
    'review.translation': 'Translation',
    'review.answer': 'Answer',
    'review.cardDetail': 'Card detail',
    'review.correct': 'Correct',
    'review.notQuite': 'Not quite',
    'review.yourScore': 'Your score',
    'review.yourAnswer': 'Your answer',
    'review.testMeNextTime': 'test me next time',
    'review.next': 'Next',
    'review.finalScore': 'Final score',
    'review.cardProgress': 'Card',
    'review.preparing': 'Preparing your review…',
    'review.prepareFailedTitle': 'Could not start quiz',
    'review.prepareFailedBody':
      'The quiz did not finish preparing. Please try again.',
    'review.noCardsTitle': 'No cards available',
    'review.noCardsBody':
      'This album does not have enough cards to build a quiz yet.',
    'review.percentCorrect': 'correct',
    'review.summaryOutstanding': 'Outstanding. You are mastering these words.',
    'review.summaryGoodEffort':
      'Good effort. One more round and you will level up fast.',
    'review.summaryGreatJob':
      'Great job. Your retention is getting really solid.',
    'review.skippedPronunciation':
      'pronunciation questions were skipped and saved for next time.',
    'review.playAgain': 'Try Again',
    'review.done': 'Done',
    'review.micPermissionRequired':
      'Microphone access is required for pronunciation questions.',
    'review.recordingMissing': 'Recording file missing. Please record again.',
    'review.recordingTooShort':
      'Recording is too short. Please say the full word clearly.',
    'review.recordingInvalidFormat':
      'Recording format error. Please record again.',
    'review.assessFailed': 'Pronunciation scoring failed. Please try again.',
    'review.recordFailed': 'Recording failed. Please try again.',
    'pronunciation.coach': 'Pronunciation coach',
    'pronunciation.listening': 'Listening',
    'pronunciation.secondsLeft': 's left',
    'pronunciation.secondsMax': 's max',
    'pronunciation.preparingScore': 'Preparing score...',
    'pronunciation.analysisFailed': 'Analysis failed',
    'pronunciation.tapMicRetry': 'Tap the mic below to try again.',
    'pronunciation.status.listeningWaveform': 'Listening to waveform...',
    'pronunciation.status.mappingPhonemes': 'Mapping phonemes...',
    'pronunciation.status.comparingTiming': 'Comparing native timing...',
    'pronunciation.status.scoring': 'Scoring pronunciation...',
    'pronunciation.pass': 'Pass',
    'pronunciation.fail': 'Fail',
    'pronunciation.showAllSounds': 'Show all sounds',
    'pronunciation.showFewerSounds': 'Show fewer sounds',
    'pronunciation.ipaUnavailable':
      'IPA details were not available for this result.',
    'pronunciation.ipaLookupFailed':
      'Unable to retrieve IPA. Please try again.',
    'pronunciation.reloadIpa': 'Retrieve IPA',
  },
  'zh-TW': {
    'common.back': '返回',
    'common.cancel': '取消',
    'common.close': '關閉',
    'common.done': '完成',
    'common.free': '未訂閱',
    'common.premium': '進階版',
    'common.trial': '試用中',
    'common.unknown': '未知',
    'common.restore': '恢復',
    'common.subscribe': '訂閱',
    'common.updating': '更新中...',
    'common.unableToOpenLink': '無法開啟連結。',
    'common.skipTutorial': '跳過導覽',
    'deck.searchPlaceholder': '搜尋卡片、相簿、筆記...',
    'deck.noOriginalSentence': '還沒有原始句子。',
    'deck.emptyWordPopTitle': '新增卡片後會出現單字',
    'deck.emptyWordPopSubtitle': '點擊可開啟卡片細節',
    'deck.newWords': '新單字',
    'deck.quickQuiz': '快速測驗',
    'deck.searchNoMatches': '找不到符合的單字',
    'deck.cacheEmpty': '暫存區是空的',
    'deck.cacheNotEmpty': '暫存區還有內容',
    'deck.alertNoWordsTitle': '還沒有單字',
    'deck.alertNoWordsBody': '先新增幾張卡片，再開始快速測驗。',
    'deck.alertNoCardsTitle': '目前沒有可開啟的卡片',
    'deck.alertNoCardsBody': '請先新增或同步卡片後再試。',
    'deck.alertAlbumNameEmptyTitle': '名稱不可為空',
    'deck.alertAlbumNameEmptyBody': '請輸入相簿名稱。',
    'deck.alertPhotoPermissionTitle': '需要相簿權限',
    'deck.alertPhotoPermissionBody': '請先允許存取相簿，才能選擇封面圖片。',
    'deck.alertPickCoverFailedTitle': '選擇失敗',
    'deck.alertPickCoverFailedBody': '無法選擇封面圖片，請稍後再試。',
    'deck.alertCannotDeleteTitle': '無法刪除',
    'deck.alertCannotDeleteBody': '預設資料夾不能刪除。',
    'deck.alertDeleteAlbumTitle': '刪除相簿',
    'deck.alertDeleteAlbumBody': '確定要刪除這個相簿嗎？',
    'deck.alertCancel': '取消',
    'deck.alertDelete': '刪除',
    'deck.tourCompleteTitle': '現在換你了',
    'deck.tourCompleteBody': '上傳你想學的內容，或從 iOS 分享選單把文字、圖片傳到 Nuances。',
    'deck.albumAllCards': '所有卡片',
    'deck.albumFavorites': '我的最愛',
    'deck.albumInternetSlang': '網路俚語',
    'deck.madeForYou': '為你整理',
    'deck.play': '測驗',
    'deck.words': '個單字',
    'deck.noWordsAddedThisDay': '這天沒有新增單字',
    'deck.albumMyNuances': '我的 Nuances',
    'deck.todayReview': '今日複習',
    'deck.allCardsReview': '所有卡片',
    'cardDetail.context': '語境',
    'cardDetail.noContext': '還沒有語境說明。',
    'cardDetail.showFullSentence': '查看完整語句',
    'cardDetail.hideFullSentence': '收起完整語句',
    'cardDetail.showFullContent': '查看完整內容',
    'cardDetail.hideFullContent': '收起完整內容',
    'cardDetail.showExampleSentences': '查看全部例句',
    'cardDetail.hideExampleSentences': '收起其他例句',
    'cardDetail.collocation': '搭配詞',
    'cardDetail.commonUsage': '常見用法',
    'cardDetail.semanticRelations': '近／反義詞',
    'cardDetail.exampleSentence': '例句',
    'cardDetail.personalNotes': '個人筆記',
    'cardDetail.editNote': '編輯筆記',
    'cardDetail.addNote': '新增筆記',
    'cardDetail.basics': '基礎',
    'cardDetail.shareScreens': '分享畫面',
    'cardDetail.front': '正面',
    'cardDetail.back': '背面',
    'cardDetail.share': '分享',
    'cardDetail.cardNote': '卡片筆記',
    'cardDetail.notePlaceholder': '寫下你的筆記...',
    'cardDetail.downloading': '下載中...',
    'cache.create': '建立',
    'cache.skip': '略過',
    'cache.adding': '新增中…',
    'cache.duplicateTitle': '已經新增',
    'cache.duplicateMessage': '完全相同的文字已在暫存佇列中。',
    'cache.deleteAllTitle': '刪除全部暫存項目？',
    'cache.deleteAllMessage': '這會永久刪除暫存佇列中的全部 {count} 個項目。',
    'cache.deleteAllConfirm': '全部刪除',
    'cache.deleteAllFailedTitle': '無法刪除',
    'cache.deleteAllFailedMessage': '請稍後再試。',
    'create.originalImage': '原始圖片',
    'create.originalContext': '原始內容',
    'create.keywords': '關鍵字',
    'create.ocrRunning': '文字辨識中...',
    'create.ocrNoText': '沒有辨識到可用文字。',
    'create.ocrFailed': '文字辨識失敗，已使用原始內容。',
    'create.editOcrModeAction': '修正文字',
    'create.editOcrModeDone': '完成',
    'create.editOcrModeHint': '點一下要修正的單字。',
    'create.editOcrTokenTitle': '修正辨識文字',
    'create.editOcrTokenBody': '生成卡片前，先把辨識錯的字改正。',
    'create.editOcrTokenCancel': '取消',
    'create.editOcrTokenSave': '儲存',
    'create.aiDepth': 'AI 深度',
    'create.saveToAlbums': '這批卡片儲存至',
    'create.allCardsOnly': '只存入所有卡片',
    'create.albumsSelected': '個相簿已選取',
    'create.noAlbumsAvailable': '尚無可選相簿',
    'create.aiMode.clarity': '快速',
    'create.aiMode.application': '詳細',
    'create.aiMode.mastery': '深入',
    'create.aiMode.clarityDescription': '最短重點。',
    'create.aiMode.applicationDescription': '更多例句。',
    'create.aiMode.masteryDescription': '最完整。',
    'create.didYouMean': '你是不是想選',
    'create.didYouMeanBody': 'AI 偵測到可能的拼字修正。',
    'create.didYouMeanYes': '是',
    'create.didYouMeanNo': '不是',
    'create.didYouMeanCustomPlaceholder': '其他單字',
    'create.didYouMeanUseCustom': '套用',
    'create.selectedWords': '已選取',
    'create.generate': '生成',
    'create.cards': '張卡片',
    'create.card': '張卡片',
    'create.addNewCards': '建立新卡片',
    'create.generateFailedTitle': '無法建立',
    'create.generateFailedBody': '無法生成這張卡片，請再試一次。',
    'create.retry': '重試',
    'create.save': '儲存',
    'create.saving': '儲存中...',
    'create.saveErrorTitle': '錯誤',
    'create.saveErrorBody': '儲存卡片失敗，請稍後再試。',
    'create.createAlbumFailedTitle': '建立失敗',
    'create.createAlbumFailedBody': '建立資料夾時發生問題，請再試一次。',
    'create.albumSettingsTitle': '相簿設定',
    'create.albumNameTitle': '相簿名稱',
    'create.albumNamePlaceholder': '輸入相簿名稱',
    'create.albumTabClassic': '經典',
    'create.albumTabImage': '圖片',
    'create.albumIcon': '圖示',
    'create.albumCoverColor': '封面顏色',
    'create.albumCancel': '取消',
    'create.albumCreate': '建立',
    'create.albumSave': '儲存',
    'create.pronunciationCoachTitle': '發音教練',
    'create.pronunciationSaveFirstBody':
      '請先儲存這張卡片，之後可在卡片細節頁練習發音。',
    'create.noSpeakableContentTitle': '無可朗讀內容',
    'create.noSpeakableContentBody': '這張卡片沒有可用於發音播放的文字。',
    'create.noCardsSelectedTitle': '尚未選擇',
    'create.noCardsSelectedBody': '請先勾選至少一張要加入 Deck 的卡片。',
    'create.uploadImageErrorUnauthed': '請先登入，才能上傳圖片。',
    'create.uploadImageErrorNoBase64': '圖片轉碼失敗：無法讀取 base64。',
    'create.uploadImageErrorEmptyBytes': '圖片轉碼失敗：位元組內容為空。',
    'create.uploadImageErrorSignedUrl': '圖片已上傳，但無法建立讀取簽名網址。',
    'create.definitionFallback': '待補充定義',
    'create.ghostStatusExtracting': '擷取單字中...',
    'create.ghostStatusAnalyzing': '分析語境中...',
    'create.ghostStatusStructuring': '整理卡片中...',
    'create.ghostStatusFinalizing': '完成翻譯中...',
    'profile.membership': '會員',
    'profile.defaultTitle': '個人資料',
    'profile.settingsTitle': '設定',
    'profile.settingsSubtitle': '調整你的個人資料與 AI 回覆語言。',
    'profile.uploadProfilePic': '上傳個人照片',
    'profile.feedback': '回饋',
    'profile.rateApp': '評分 Nuances',
    'profile.messageDeveloper': '回報問題',
    'profile.messageDeveloperMeta': '用 Email 回報問題或提供建議。',
    'profile.feedbackEmailSubject': 'Nuances 回饋',
    'profile.feedbackEmailBody':
      'Nuances 團隊你好，\n\n我想提供以下回饋：\n\n\n\n裝置：\n發生的情況：',
    'profile.legal': '法律資訊',
    'profile.privacyPolicy': '隱私政策',
    'profile.termsOfService': '服務條款',
    'profile.mainScreen': '主畫面',
    'profile.language': '語言',
    'profile.appearance': '外觀',
    'profile.voice': '聲音',
    'profile.font': '字體',
    'profile.reminders': '提醒',
    'profile.remindersOn': '早晚提醒',
    'profile.remindersOff': '關閉',
    'profile.replayTutorial': '重看教學',
    'profile.deleteAccount': '刪除帳號',
    'profile.deleteAccountDeleting': '刪除中...',
    'profile.deleteAccountConfirmTitle': '刪除帳號',
    'profile.deleteAccountConfirmBody':
      '確定要永久刪除帳號嗎？所有單字卡、設定與個人資料都會被清除，而且無法復原。',
    'profile.deleteAccountConfirmCancel': '取消',
    'profile.deleteAccountConfirmDelete': '刪除',
    'profile.deleteAccountFailedTitle': '刪除失敗',
    'profile.deleteAccountFailedBody': '無法刪除帳號，請稍後再試或聯絡支援。',
    'profile.menuTitle': '個人資料',
    'profile.menuBody': '更多選單功能之後可以接進來。',
    'profile.devOverrideUpdatedTitle': '開發覆寫已更新',
    'profile.devOverrideUpdatedBody': '目前方案已切換為 {plan}。',
    'profile.devOverrideFailedTitle': '開發覆寫失敗',
    'profile.devOverrideFailedBody': '請稍後再試。',
    'profile.mainScreenSummary.wordPopOn': '單字輪播開啟',
    'profile.mainScreenSummary.wordPopOff': '單字輪播關閉',
    'settings.title.language': '語言',
    'settings.title.voice': '聲音',
    'settings.title.mainScreen': '主畫面',
    'settings.title.membership': '會員',
    'settings.title.appearance': '外觀',
    'settings.title.font': '字體',
    'settings.theme.system': '自動',
    'settings.theme.light': '淺色',
    'settings.theme.dark': '深色',
    'settings.theme.updateFailedTitle': '無法更新外觀',
    'settings.theme.updateFailedBody': '請稍後再試。',
    'settings.font.wordSize': '單字貼紙大小',
    'settings.language.subtitle': '同時控制 App 介面語言與 AI 回覆語言。',
    'settings.language.replyTitle': 'App 與回覆語言',
    'settings.language.replySubtitle':
      '切換 App 介面、AI 回覆與通知語言；英文發音維持不變。',
    'settings.language.imageTextTitle': '圖片文字語言',
    'settings.language.imageTextSubtitle': '選擇 Nuances 辨識圖片文字的方式。',
    'settings.language.imageTextAuto': '自動偵測',
    'settings.language.imageTextAutoMeta':
      '建議使用。Nuances 會自動選擇最合適的辨識語言。',
    'settings.language.imageTextPreferred': '選擇偏好語言',
    'settings.language.imageTextPreferredMeta':
      '優先辨識你最常掃描的語言，其他語言仍可能被辨識。',
    'settings.language.imageTextChinese': '中文（繁體與簡體）',
    'settings.language.imageTextEnglish': '英文',
    'settings.language.imageTextKorean': '韓文',
    'settings.language.imageTextJapanese': '日文',
    'settings.language.imageTextSpanish': '西班牙文',
    'settings.language.english': 'English',
    'settings.language.chineseTraditional': '繁體中文',
    'settings.language.chineseSimplified': '簡體中文',
    'settings.language.japanese': '日本語',
    'settings.language.korean': '한국어',
    'settings.language.spanish': 'Español',
    'settings.language.french': 'Français',
    'settings.language.englishMeta': '介面與 AI 回覆使用英文。',
    'settings.language.chineseTraditionalMeta': '介面與 AI 回覆使用繁體中文。',
    'settings.language.chineseSimplifiedMeta': '介面與 AI 回覆使用簡體中文。',
    'settings.language.restartTitle': '語言已更新',
    'settings.language.restartBody':
      '請完整關閉並重新開啟 Nuances，讓所有畫面套用新語言。',
    'settings.language.updateFailedTitle': '更新失敗',
    'settings.language.updateFailedBody': '無法儲存語言設定，請稍後再試。',
    'settings.main.albumReorderInstruction': '長按拖曳',
    'settings.main.albumsPerPage': '每頁相簿數',
    'settings.main.perPageSuffix': '每頁',
    'settings.main.wordPop': '單字輪播',
    'settings.main.wordPopMeta': '在主畫面顯示這個區塊',
    'settings.main.wordPopSource': '單字輪播來源',
    'settings.main.wordPopSourceMeta': '選擇要從哪個相簿輪播單字。',
    'settings.membership.feature.aiCards': 'AI 建卡',
    'settings.membership.feature.voiceCache': '進階語音快取',
    'settings.membership.feature.pronunciation': '發音評分',
    'settings.membership.tier.lite': 'Nuances LITE',
    'settings.membership.tier.pro': 'Nuances PRO',
    'settings.membership.feature.lite.aiCards': 'AI 智慧建卡（每月 200 張）',
    'settings.membership.feature.lite.voiceCache': '口說發音評分（每月 300 次）',
    'settings.membership.feature.lite.review': '完整複習與記憶演算法',
    'settings.membership.feature.pro.aiCards': '高用量 AI 建卡（每月 800 張）',
    'settings.membership.feature.pro.voiceCache': '口說發音評分（每月 1,200 次）',
    'settings.membership.feature.pro.speed': '優先產卡速度與完整進階權限',
    'settings.membership.badge.save': '省 35% · 最划算',
    'settings.membership.upsell.title': '你已用盡 LITE 額度',
    'settings.membership.upsell.body': '升級 PRO 可享有 4 倍 AI 建卡額度、進階發音評分與優先產生速度。',
    'settings.membership.upsell.cta': '升級進階 PRO',
    'settings.membership.fairUseSummary':
      'AI、語音與發音功能適用合理使用額度。',
    'settings.membership.fairUseFooter': 'AI、語音與發音功能適用合理使用限制。',
    'settings.membership.trialReminder':
      '確認訂閱後將立即付款。',
    'settings.membership.renewalDisclosure':
      '付款會立即收取；除非至少於續訂前 24 小時取消，否則會自動續訂。',
    'settings.membership.manageSubscription': '管理或取消訂閱',
    'settings.membership.manageSubscriptionMeta': '開啟 Apple 訂閱設定。',
    'settings.membership.plan.weekly': '每週',
    'settings.membership.plan.monthly': '每月',
    'settings.membership.plan.yearly': '每年',
    'settings.membership.plan.monthlyEquivalent': '平均每月 {amount}',
    'settings.membership.plan.billedWeekly': '每週計費',
    'settings.membership.plan.billedMonthly': '每月計費',
    'settings.membership.plan.billedYearly': '每年計費',
    'settings.membership.autoRenews': '除非取消，否則自動續訂',
    'settings.membership.back': '返回',
    'settings.membership.restore': '恢復',
    'settings.membership.subscribe': '訂閱',
    'settings.membership.updating': '更新中...',
    'settings.membership.active': '進階版已啟用',
    'settings.membership.welcomeTitle': '歡迎使用進階版',
    'settings.membership.welcomeBody':
      'Nuances Pro 已就緒，AI 卡片、語音與教練功能已解鎖。',
    'settings.membership.notSignedInTitle': '尚未登入',
    'settings.membership.notSignedInBody': '請先登入，再升級到進階版。',
    'settings.membership.purchasePendingSyncTitle': '升級完成',
    'settings.membership.purchasePendingSyncBody':
      '付款已完成，但進階版狀態尚未同步。請稍後再試或恢復購買。',
    'settings.membership.purchaseFailedTitle': '升級失敗',
    'settings.membership.purchaseFailedBody': '請稍後再試。',
    'settings.membership.restoreNoSubscriptionTitle': '恢復完成',
    'settings.membership.restoreNoSubscriptionBody':
      '目前沒有可恢復的有效進階版訂閱。',
    'settings.membership.restoreFailedTitle': '恢復失敗',
    'settings.membership.restoreFailedBody': '請稍後再試。',
    'sort.eyebrow': '排序選項',
    'sort.title': '排序方式',
    'sort.recentlyAdded': '最近新增',
    'sort.recentlyReviewed': '最近複習',
    'sort.alphabetical': '字母順序',
    'sort.currentPrefix': '目前：',
    'review.tuningEyebrow': '複習設定',
    'review.tuningTitle': '題目數',
    'review.questionsLabel': '題',
    'review.todayNewWordsOnly': '只看今天的新單字',
    'review.questionTypes': '題型',
    'review.selectAllQuestionTypes': '全選',
    'review.sourceAlbums': '題庫來源',
    'review.questionType.fillBlank': '句子填空',
    'review.questionType.spelling': '拼出單字',
    'review.questionType.guessWord': '看意思猜單字',
    'review.questionType.guessMeaning': '翻譯',
    'review.questionType.contextMeaning': '判斷語境意思',
    'review.questionType.partOfSpeech': '判斷詞性',
    'review.questionType.pronunciation': '發音挑戰',
    'cardAction.eyebrow': '卡片選項',
    'cardAction.title': '卡片選項',
    'cardAction.delete': '刪除',
    'albumSheet.addToAlbum': '加入相簿',
    'albumSheet.done': '完成',
    'albumSheet.createNewAlbum': '建立新相簿',
    'albumSheet.cardCountSuffix': '張卡片',
    'cache.inputLabel': '貼上或輸入文字',
    'cache.inputPlaceholder': '貼上包含俚語、慣用語或片語的句子...',
    'cache.addToCache': '加入暫存',
    'cache.tabText': '文字',
    'cache.tabImage': '圖片',
    'cache.upload': '上傳',
    'cache.imageLabel': '拍照或上傳圖片',
    'cache.uploadImage': '上傳圖片',
    'cache.processingImage': '圖片處理中...',
    'cache.clear': '清除',
    'cache.paste': '貼上',
    'cache.add': '加入',
    'cache.todayUploads': '今日上傳',
    'cache.noUploadsToday': '今天尚無上傳',
    'cropper.title': '裁切圖片',
    'cropper.helper': '拖曳與縮放',
    'cropper.processing': '處理中...',
    'cropper.failedTitle': '裁切失敗',
    'cropper.failedBody': '請重試。',
    'camera.permissionRequired': '需要相機權限才能拍照。',
    'appVersion.updateUnavailableTitle': '無法更新',
    'appVersion.updateUnavailableNoUrl': 'App Store 更新連結尚未設定。',
    'appVersion.updateUnavailableOpenFailed':
      '無法開啟 App Store 更新頁面，請稍後再試。',
    'appVersion.updateRequiredTitle': '需要更新',
    'appVersion.updateAvailableTitle': '有新版本',
    'appVersion.updateRequiredBody':
      '請從 App Store 更新 Nuances，才能繼續使用目前支援的版本。',
    'appVersion.updateAvailableBody':
      'Nuances 有新版本可用。更新後可取得最新修正與改進。',
    'appVersion.updateAction': '更新 App',
    'appVersion.laterAction': '稍後',
    'auth.connecting': '連線中...',
    'auth.continueWithApple': '使用 Apple 繼續',
    'auth.continueWithGoogle': '使用 Google 繼續',
    'onboarding.question.learningLanguages':
      '你希望 Nuances 用什麼語言解釋英文？',
    'onboarding.question.captureHabit': '遇到不懂的字時，你通常怎麼辦？',
    'onboarding.question.stumbleContext': '你通常在哪裡遇到這些字？',
    'onboarding.question.breakdownDepth': '你希望我們解釋多詳細？',
    'onboarding.option.screenshot': '截圖',
    'onboarding.option.notes': '筆記',
    'onboarding.option.search': '搜尋',
    'onboarding.option.reading': '閱讀',
    'onboarding.option.listening': '聆聽',
    'onboarding.option.watching': '觀看',
    'onboarding.option.quick': '快速',
    'onboarding.option.detailed': '詳細',
    'onboarding.option.deepDive': '深入',
    'onboarding.subtitle': '選擇符合你的選項。',
    'onboarding.continue': '繼續',
    'onboarding.start': '開始使用 Nuances',
    'onboarding.saving': '儲存中...',
    'onboarding.errorTitle': '初始設定失敗',
    'onboarding.errorSave': '無法儲存初始設定，請再試一次。',
    'review.prompt.chooseWord': '選出正確單字',
    'review.prompt.fillBlank': '選出填入空格的單字',
    'review.prompt.spelling': '輸入填入空格的單字',
    'review.prompt.chooseTranslation': '選出正確定義',
    'review.prompt.chooseSentenceMeaning': '選出句中的意思',
    'review.prompt.choosePartOfSpeech': '選出正確詞性',
    'review.prompt.pronounceWord': '唸出這個單字',
    'review.playPronunciation': '播放發音',
    'review.pronunciationHint': '清楚唸出這個字，準確度超過 60% 就通過。',
    'review.scoring': '評分中...',
    'review.stopAndScore': '停止並評分',
    'review.recordPronunciation': '錄音發音',
    'review.cantSpeakNow': '現在不能說話',
    'review.spellingPlaceholder': '輸入缺少的單字',
    'review.submitSpelling': '檢查拼字',
    'review.wordTranslation': '單字翻譯',
    'review.sentence': '句子',
    'review.translation': '翻譯',
    'review.answer': '答案',
    'review.cardDetail': '卡片內容',
    'review.correct': '答對',
    'review.notQuite': '還差一點',
    'review.yourScore': '你的分數',
    'review.yourAnswer': '你的答案',
    'review.testMeNextTime': '下次再考我',
    'review.next': '下一題',
    'review.finalScore': '最終分數',
    'review.cardProgress': '第',
    'review.preparing': '正在準備複習...',
    'review.prepareFailedTitle': '無法開始測驗',
    'review.prepareFailedBody': '測驗準備沒有完成，請再試一次。',
    'review.noCardsTitle': '沒有可用卡片',
    'review.noCardsBody': '這個相簿的卡片還不夠建立測驗。',
    'review.percentCorrect': '答對',
    'review.summaryOutstanding': '太強了，這些單字正在變成你的東西。',
    'review.summaryGoodEffort': '不錯，再跑一輪會進步很快。',
    'review.summaryGreatJob': '做得好，你的記憶正在穩定下來。',
    'review.skippedPronunciation': '題發音題已略過，會留到下次。',
    'review.playAgain': '再試一次',
    'review.done': '完成',
    'review.micPermissionRequired': '需要麥克風權限才能進行發音題。',
    'review.recordingMissing': '錄音檔遺失，請重新錄音。',
    'review.recordingTooShort': '錄音太短，請清楚唸出完整單字再送出。',
    'review.recordingInvalidFormat': '錄音格式錯誤，請重新錄音。',
    'review.assessFailed': '發音評分失敗，請再試一次。',
    'review.recordFailed': '錄音失敗，請再試一次。',
    'pronunciation.coach': '發音教練',
    'pronunciation.listening': '聆聽中',
    'pronunciation.secondsLeft': '秒剩餘',
    'pronunciation.secondsMax': '秒上限',
    'pronunciation.preparingScore': '正在準備分數...',
    'pronunciation.analysisFailed': '分析失敗',
    'pronunciation.tapMicRetry': '點下方麥克風再試一次。',
    'pronunciation.status.listeningWaveform': '正在聽你的聲波...',
    'pronunciation.status.mappingPhonemes': '正在對齊音素...',
    'pronunciation.status.comparingTiming': '正在比較母語節奏...',
    'pronunciation.status.scoring': '正在評分發音...',
    'pronunciation.pass': '通過',
    'pronunciation.fail': '未通過',
    'pronunciation.showAllSounds': '顯示所有音素',
    'pronunciation.showFewerSounds': '收合音素',
    'pronunciation.ipaUnavailable': '這次沒有取得正確的 IPA 音標。',
    'pronunciation.ipaLookupFailed': '無法取得 IPA 音標，請再試一次。',
    'pronunciation.reloadIpa': '重新取得 IPA 音標',
  },
  'zh-CN': {
    'common.back': '返回',
    'common.cancel': '取消',
    'common.close': '关闭',
    'common.done': '完成',
    'common.free': '未订阅',
    'common.premium': '进阶版',
    'common.trial': '试用中',
    'common.unknown': '未知',
    'common.restore': '恢复',
    'common.subscribe': '订阅',
    'common.updating': '更新中...',
    'common.unableToOpenLink': '无法打开链接。',
    'common.skipTutorial': '跳过导览',
    'deck.searchPlaceholder': '搜索卡片、相册、笔记...',
    'deck.noOriginalSentence': '还没有原始句子。',
    'deck.emptyWordPopTitle': '新增卡片后会出现单词',
    'deck.emptyWordPopSubtitle': '点击可打开卡片详情',
    'deck.newWords': '新单词',
    'deck.quickQuiz': '快速测验',
    'deck.searchNoMatches': '找不到符合的单词',
    'deck.cacheEmpty': '暂存区是空的',
    'deck.cacheNotEmpty': '暂存区还有内容',
    'deck.alertNoWordsTitle': '还没有单词',
    'deck.alertNoWordsBody': '先新增几张卡片，再开始快速测验。',
    'deck.alertNoCardsTitle': '目前没有可打开的卡片',
    'deck.alertNoCardsBody': '请先新增或同步卡片后再试。',
    'deck.alertAlbumNameEmptyTitle': '名称不能为空',
    'deck.alertAlbumNameEmptyBody': '请输入相册名称。',
    'deck.alertPhotoPermissionTitle': '需要相册权限',
    'deck.alertPhotoPermissionBody': '请先允许访问相册，才能选择封面图片。',
    'deck.alertPickCoverFailedTitle': '选择失败',
    'deck.alertPickCoverFailedBody': '无法选择封面图片，请稍后再试。',
    'deck.alertCannotDeleteTitle': '无法删除',
    'deck.alertCannotDeleteBody': '默认文件夹不能删除。',
    'deck.alertDeleteAlbumTitle': '删除相册',
    'deck.alertDeleteAlbumBody': '确定要删除这个相册吗？',
    'deck.alertCancel': '取消',
    'deck.alertDelete': '删除',
    'deck.tourCompleteTitle': '现在换你了',
    'deck.tourCompleteBody': '上传你想学的内容，或从 iOS 分享菜单把文字、图片传到 Nuances。',
    'deck.albumAllCards': '所有卡片',
    'deck.albumFavorites': '我的收藏',
    'deck.albumInternetSlang': '网络俚语',
    'deck.madeForYou': '为你整理',
    'deck.play': '测验',
    'deck.words': '个单词',
    'deck.noWordsAddedThisDay': '这天没有新增单词',
    'deck.albumMyNuances': '我的 Nuances',
    'deck.todayReview': '今日复习',
    'deck.allCardsReview': '所有卡片',
    'cardDetail.context': '语境',
    'cardDetail.noContext': '还没有语境说明。',
    'cardDetail.showFullSentence': '查看完整语句',
    'cardDetail.hideFullSentence': '收起完整语句',
    'cardDetail.showFullContent': '查看完整内容',
    'cardDetail.hideFullContent': '收起完整内容',
    'cardDetail.showExampleSentences': '查看全部例句',
    'cardDetail.hideExampleSentences': '收起其他例句',
    'cardDetail.collocation': '搭配词',
    'cardDetail.commonUsage': '常见用法',
    'cardDetail.semanticRelations': '近／反义词',
    'cardDetail.exampleSentence': '例句',
    'cardDetail.personalNotes': '个人笔记',
    'cardDetail.editNote': '编辑笔记',
    'cardDetail.addNote': '新增笔记',
    'cardDetail.basics': '基础',
    'cardDetail.shareScreens': '分享画面',
    'cardDetail.front': '正面',
    'cardDetail.back': '背面',
    'cardDetail.share': '分享',
    'cardDetail.cardNote': '卡片笔记',
    'cardDetail.notePlaceholder': '写下你的笔记...',
    'cardDetail.downloading': '下载中...',
    'cache.create': '建立',
    'cache.skip': '跳过',
    'cache.adding': '新增中…',
    'cache.duplicateTitle': '已经新增',
    'cache.duplicateMessage': '完全相同的文字已在暂存队列中。',
    'cache.deleteAllTitle': '删除全部暂存项目？',
    'cache.deleteAllMessage': '这会永久删除暂存队列中的全部 {count} 个项目。',
    'cache.deleteAllConfirm': '全部删除',
    'cache.deleteAllFailedTitle': '无法删除',
    'cache.deleteAllFailedMessage': '请稍后再试。',
    'create.originalImage': '原始图片',
    'create.originalContext': '原始内容',
    'create.keywords': '关键词',
    'create.ocrRunning': '文字识别中...',
    'create.ocrNoText': '没有识别到可用文字。',
    'create.ocrFailed': '文字识别失败，已使用原始内容。',
    'create.editOcrModeAction': '修正文字',
    'create.editOcrModeDone': '完成',
    'create.editOcrModeHint': '点一下要修正的单词。',
    'create.editOcrTokenTitle': '修正辨識文字',
    'create.editOcrTokenBody': '生成卡片前，先把识别错的字改正。',
    'create.editOcrTokenCancel': '取消',
    'create.editOcrTokenSave': '保存',
    'create.aiDepth': 'AI 深度',
    'create.saveToAlbums': '这批卡片保存至',
    'create.allCardsOnly': '只存入所有卡片',
    'create.albumsSelected': '个相册已选择',
    'create.noAlbumsAvailable': '暂无可选相册',
    'create.aiMode.clarity': '快速',
    'create.aiMode.application': '详细',
    'create.aiMode.mastery': '深入',
    'create.aiMode.clarityDescription': '最短重点。',
    'create.aiMode.applicationDescription': '更多例句。',
    'create.aiMode.masteryDescription': '最完整。',
    'create.didYouMean': '你是不是想选',
    'create.didYouMeanBody': 'AI 检测到可能的拼写修正。',
    'create.didYouMeanYes': '是',
    'create.didYouMeanNo': '不是',
    'create.didYouMeanCustomPlaceholder': '其他单词',
    'create.didYouMeanUseCustom': '套用',
    'create.selectedWords': '已选择',
    'create.generate': '生成',
    'create.cards': '张卡片',
    'create.card': '张卡片',
    'create.addNewCards': '建立新卡片',
    'create.generateFailedTitle': '无法建立',
    'create.generateFailedBody': '无法生成这张卡片，请再试一次。',
    'create.retry': '重试',
    'create.save': '保存',
    'create.saving': '保存中...',
    'create.saveErrorTitle': '错误',
    'create.saveErrorBody': '保存卡片失败，请稍后再试。',
    'create.createAlbumFailedTitle': '建立失败',
    'create.createAlbumFailedBody': '建立文件夹时发生问题，请再试一次。',
    'create.albumSettingsTitle': '相册设置',
    'create.albumNameTitle': '相册名称',
    'create.albumNamePlaceholder': '输入相册名称',
    'create.albumTabClassic': '经典',
    'create.albumTabImage': '图片',
    'create.albumIcon': '图标',
    'create.albumCoverColor': '封面颜色',
    'create.albumCancel': '取消',
    'create.albumCreate': '建立',
    'create.albumSave': '保存',
    'create.pronunciationCoachTitle': '发音教练',
    'create.pronunciationSaveFirstBody':
      '请先保存这张卡片，之后可在卡片详情页练习发音。',
    'create.noSpeakableContentTitle': '无可朗读内容',
    'create.noSpeakableContentBody': '这张卡片没有可用于发音播放的文字。',
    'create.noCardsSelectedTitle': '尚未选择',
    'create.noCardsSelectedBody': '请先勾选至少一张要加入 Deck 的卡片。',
    'create.uploadImageErrorUnauthed': '请先登录，才能上传图片。',
    'create.uploadImageErrorNoBase64': '图片转码失败：无法读取 base64。',
    'create.uploadImageErrorEmptyBytes': '图片转码失败：字节内容为空。',
    'create.uploadImageErrorSignedUrl': '图片已上传，但无法建立读取签名网址。',
    'create.definitionFallback': '待补充定义',
    'create.ghostStatusExtracting': '提取单词中...',
    'create.ghostStatusAnalyzing': '分析语境中...',
    'create.ghostStatusStructuring': '整理卡片中...',
    'create.ghostStatusFinalizing': '完成翻译中...',
    'profile.membership': '会员',
    'profile.defaultTitle': '个人资料',
    'profile.settingsTitle': '设置',
    'profile.settingsSubtitle': '调整个人资料与 AI 回复语言。',
    'profile.uploadProfilePic': '上传个人照片',
    'profile.feedback': '反馈',
    'profile.rateApp': '给 Nuances 评分',
    'profile.messageDeveloper': '报告问题',
    'profile.messageDeveloperMeta': '用 Email 回报问题或提供建议。',
    'profile.feedbackEmailSubject': 'Nuances 反馈',
    'profile.feedbackEmailBody':
      'Nuances 团队你好，\n\n我想提供以下反馈：\n\n\n\n设备：\n发生的情况：',
    'profile.legal': '法律信息',
    'profile.privacyPolicy': '隐私政策',
    'profile.termsOfService': '服务条款',
    'profile.mainScreen': '主屏幕',
    'profile.language': '语言',
    'profile.appearance': '外观',
    'profile.voice': '声音',
    'profile.font': '字体',
    'profile.reminders': '提醒',
    'profile.remindersOn': '早晚提醒',
    'profile.remindersOff': '关闭',
    'profile.replayTutorial': '重看教学',
    'profile.deleteAccount': '删除账号',
    'profile.deleteAccountDeleting': '删除中...',
    'profile.deleteAccountConfirmTitle': '删除账号',
    'profile.deleteAccountConfirmBody':
      '确定要永久删除账号吗？所有单词卡、设置与个人资料都会被清除，而且无法恢复。',
    'profile.deleteAccountConfirmCancel': '取消',
    'profile.deleteAccountConfirmDelete': '删除',
    'profile.deleteAccountFailedTitle': '删除失败',
    'profile.deleteAccountFailedBody': '无法删除账号，请稍后再试或联系支持。',
    'profile.menuTitle': '个人资料',
    'profile.menuBody': '更多菜单功能之后可以接进来。',
    'profile.devOverrideUpdatedTitle': '开发覆写已更新',
    'profile.devOverrideUpdatedBody': '目前方案已切换为 {plan}。',
    'profile.devOverrideFailedTitle': '开发覆写失败',
    'profile.devOverrideFailedBody': '请稍后再试。',
    'profile.mainScreenSummary.wordPopOn': '单词轮播开启',
    'profile.mainScreenSummary.wordPopOff': '单词轮播关闭',
    'settings.title.language': '语言',
    'settings.title.voice': '声音',
    'settings.title.mainScreen': '主屏幕',
    'settings.title.membership': '会员',
    'settings.title.appearance': '外观',
    'settings.title.font': '字体',
    'settings.theme.system': '自动',
    'settings.theme.light': '浅色',
    'settings.theme.dark': '深色',
    'settings.theme.updateFailedTitle': '无法更新外观',
    'settings.theme.updateFailedBody': '请稍后再试。',
    'settings.font.wordSize': '单词贴纸大小',
    'settings.language.subtitle': '同时控制 App 界面语言与 AI 回复语言。',
    'settings.language.replyTitle': 'App 与回复语言',
    'settings.language.replySubtitle':
      '切换 App 界面、AI 回复与通知语言；英文发音保持不变。',
    'settings.language.imageTextTitle': '图片文字语言',
    'settings.language.imageTextSubtitle': '选择 Nuances 识别图片文字的方式。',
    'settings.language.imageTextAuto': '自动检测',
    'settings.language.imageTextAutoMeta':
      '建议使用。Nuances 会自动选择最合适的识别语言。',
    'settings.language.imageTextPreferred': '选择偏好语言',
    'settings.language.imageTextPreferredMeta':
      '优先识别你最常扫描的语言，其他语言仍可能被识别。',
    'settings.language.imageTextChinese': '中文（繁体与简体）',
    'settings.language.imageTextEnglish': '英文',
    'settings.language.imageTextKorean': '韩文',
    'settings.language.imageTextJapanese': '日文',
    'settings.language.imageTextSpanish': '西班牙文',
    'settings.language.english': '英文',
    'settings.language.chineseTraditional': '繁体中文',
    'settings.language.chineseSimplified': '简体中文',
    'settings.language.japanese': '日本語',
    'settings.language.korean': '한국어',
    'settings.language.spanish': 'Español',
    'settings.language.french': 'Français',
    'settings.language.englishMeta': '界面与 AI 回复使用英文。',
    'settings.language.chineseTraditionalMeta': '界面与 AI 回复使用繁体中文。',
    'settings.language.chineseSimplifiedMeta': '界面与 AI 回复使用简体中文。',
    'settings.language.restartTitle': '语言已更新',
    'settings.language.restartBody':
      '请完整关闭并重新打开 Nuances，让所有页面应用新语言。',
    'settings.language.updateFailedTitle': '更新失败',
    'settings.language.updateFailedBody': '无法保存语言设置，请稍后再试。',
    'settings.main.albumReorderInstruction': '长按拖动',
    'settings.main.albumsPerPage': '每页相册数',
    'settings.main.perPageSuffix': '每页',
    'settings.main.wordPop': '单词轮播',
    'settings.main.wordPopMeta': '在主屏幕显示这个区块',
    'settings.main.wordPopSource': '单词轮播来源',
    'settings.main.wordPopSourceMeta': '选择要从哪个相册轮播单词。',
    'settings.membership.feature.aiCards': 'AI 建卡',
    'settings.membership.feature.voiceCache': '进阶语音快取',
    'settings.membership.feature.pronunciation': '发音评分',
    'settings.membership.tier.lite': 'Nuances LITE',
    'settings.membership.tier.pro': 'Nuances PRO',
    'settings.membership.feature.lite.aiCards': 'AI 智慧建卡（每月 200 张）',
    'settings.membership.feature.lite.voiceCache': '口说发音评分（每月 300 次）',
    'settings.membership.feature.lite.review': '完整复习与记忆算法',
    'settings.membership.feature.pro.aiCards': '高用量 AI 建卡（每月 800 张）',
    'settings.membership.feature.pro.voiceCache': '口说发音评分（每月 1,200 次）',
    'settings.membership.feature.pro.speed': '优先产卡速度与完整进阶权限',
    'settings.membership.badge.save': '省 35% · 最划算',
    'settings.membership.upsell.title': '你已用尽 LITE 额度',
    'settings.membership.upsell.body': '升级 PRO 可享有 4 倍 AI 建卡额度、进阶发音评分与优先产生速度。',
    'settings.membership.upsell.cta': '升级进阶 PRO',
    'settings.membership.fairUseSummary':
      'AI、语音与发音功能适用合理使用额度。',
    'settings.membership.fairUseFooter': 'AI、语音与发音功能适用合理使用限制。',
    'settings.membership.trialReminder':
      '确认订阅后将立即付款。',
    'settings.membership.renewalDisclosure':
      '付款会立即收取；除非至少于续订前 24 小时取消，否则会自动续订。',
    'settings.membership.manageSubscription': '管理或取消订阅',
    'settings.membership.manageSubscriptionMeta': '开启 Apple 订阅设置。',
    'settings.membership.plan.weekly': '每周',
    'settings.membership.plan.monthly': '每月',
    'settings.membership.plan.yearly': '每年',
    'settings.membership.plan.monthlyEquivalent': '平均每月 {amount}',
    'settings.membership.plan.billedWeekly': '每周计费',
    'settings.membership.plan.billedMonthly': '每月计费',
    'settings.membership.plan.billedYearly': '每年计费',
    'settings.membership.autoRenews': '除非取消，否则自动续订',
    'settings.membership.back': '返回',
    'settings.membership.restore': '恢复',
    'settings.membership.subscribe': '订阅',
    'settings.membership.updating': '更新中...',
    'settings.membership.active': '进阶版已启用',
    'settings.membership.welcomeTitle': '欢迎使用进阶版',
    'settings.membership.welcomeBody':
      'Nuances Pro 已就绪，AI 卡片、语音与教练功能已解锁。',
    'settings.membership.notSignedInTitle': '尚未登录',
    'settings.membership.notSignedInBody': '请先登录，再升级到进阶版。',
    'settings.membership.purchasePendingSyncTitle': '升级完成',
    'settings.membership.purchasePendingSyncBody':
      '付款已完成，但进阶版状态尚未同步。请稍后再试或恢复购买。',
    'settings.membership.purchaseFailedTitle': '升级失败',
    'settings.membership.purchaseFailedBody': '请稍后再试。',
    'settings.membership.restoreNoSubscriptionTitle': '恢复完成',
    'settings.membership.restoreNoSubscriptionBody':
      '目前没有可恢复的有效进阶版订阅。',
    'settings.membership.restoreFailedTitle': '恢复失败',
    'settings.membership.restoreFailedBody': '请稍后再试。',
    'sort.eyebrow': '排序选项',
    'sort.title': '排序方式',
    'sort.recentlyAdded': '最近新增',
    'sort.recentlyReviewed': '最近复习',
    'sort.alphabetical': '字母顺序',
    'sort.currentPrefix': '当前：',
    'review.tuningEyebrow': '复习设置',
    'review.tuningTitle': '题目数',
    'review.questionsLabel': '题',
    'review.todayNewWordsOnly': '只看今天的新单词',
    'review.questionTypes': '题型',
    'review.selectAllQuestionTypes': '全选',
    'review.sourceAlbums': '题库来源',
    'review.questionType.fillBlank': '句子填空',
    'review.questionType.spelling': '拼出单词',
    'review.questionType.guessWord': '看意思猜单词',
    'review.questionType.guessMeaning': '翻译',
    'review.questionType.contextMeaning': '判断语境意思',
    'review.questionType.partOfSpeech': '判断词性',
    'review.questionType.pronunciation': '发音挑战',
    'cardAction.eyebrow': '卡片选项',
    'cardAction.title': '卡片选项',
    'cardAction.delete': '删除',
    'albumSheet.addToAlbum': '加入相册',
    'albumSheet.done': '完成',
    'albumSheet.createNewAlbum': '建立新相册',
    'albumSheet.cardCountSuffix': '张卡片',
    'cache.inputLabel': '粘贴或输入文字',
    'cache.inputPlaceholder': '粘贴包含俚语、惯用语或短语的句子...',
    'cache.addToCache': '加入暂存',
    'cache.tabText': '文字',
    'cache.tabImage': '图片',
    'cache.upload': '上传',
    'cache.imageLabel': '拍照或上传图片',
    'cache.uploadImage': '上传图片',
    'cache.processingImage': '图片处理中...',
    'cache.clear': '清除',
    'cache.paste': '粘贴',
    'cache.add': '加入',
    'cache.todayUploads': '今日上传',
    'cache.noUploadsToday': '今天尚无上传',
    'cropper.title': '裁切图片',
    'cropper.helper': '拖拽与缩放',
    'cropper.processing': '处理中...',
    'cropper.failedTitle': '裁切失败',
    'cropper.failedBody': '请重试。',
    'camera.permissionRequired': '需要相机权限才能拍照。',
    'appVersion.updateUnavailableTitle': '无法更新',
    'appVersion.updateUnavailableNoUrl': 'App Store 更新链接尚未设置。',
    'appVersion.updateUnavailableOpenFailed':
      '无法打开 App Store 更新页面，请稍后再试。',
    'appVersion.updateRequiredTitle': '需要更新',
    'appVersion.updateAvailableTitle': '有新版本',
    'appVersion.updateRequiredBody':
      '请从 App Store 更新 Nuances，才能继续使用当前支持的版本。',
    'appVersion.updateAvailableBody':
      'Nuances 有新版本可用。更新后可获得最新修复与改进。',
    'appVersion.updateAction': '更新 App',
    'appVersion.laterAction': '稍后',
    'auth.connecting': '连接中...',
    'auth.continueWithApple': '使用 Apple 继续',
    'auth.continueWithGoogle': '使用 Google 继续',
    'onboarding.question.learningLanguages':
      '你希望 Nuances 用什么语言解释英文？',
    'onboarding.question.captureHabit': '遇到不懂的词时，你通常怎么办？',
    'onboarding.question.stumbleContext': '你通常在哪里遇到这些词？',
    'onboarding.question.breakdownDepth': '你希望我们解释多详细？',
    'onboarding.option.screenshot': '截图',
    'onboarding.option.notes': '笔记',
    'onboarding.option.search': '搜索',
    'onboarding.option.reading': '阅读',
    'onboarding.option.listening': '聆听',
    'onboarding.option.watching': '观看',
    'onboarding.option.quick': '快速',
    'onboarding.option.detailed': '详细',
    'onboarding.option.deepDive': '深入',
    'onboarding.subtitle': '选择符合你的选项。',
    'onboarding.continue': '继续',
    'onboarding.start': '开始使用 Nuances',
    'onboarding.saving': '保存中...',
    'onboarding.errorTitle': '初始设置失败',
    'onboarding.errorSave': '无法保存初始设置，请再试一次。',
    'review.prompt.chooseWord': '选出正确单词',
    'review.prompt.fillBlank': '选出填入空格的单词',
    'review.prompt.spelling': '输入填入空格的单词',
    'review.prompt.chooseTranslation': '选出正确定义',
    'review.prompt.chooseSentenceMeaning': '选出句中的意思',
    'review.prompt.choosePartOfSpeech': '选出正确词性',
    'review.prompt.pronounceWord': '读出这个单词',
    'review.playPronunciation': '播放发音',
    'review.pronunciationHint': '清楚读出这个词，准确度超过 60% 就通过。',
    'review.scoring': '评分中...',
    'review.stopAndScore': '停止并评分',
    'review.recordPronunciation': '录音发音',
    'review.cantSpeakNow': '现在不能说话',
    'review.spellingPlaceholder': '输入缺少的单词',
    'review.submitSpelling': '检查拼写',
    'review.wordTranslation': '单词翻译',
    'review.sentence': '句子',
    'review.translation': '翻译',
    'review.answer': '答案',
    'review.cardDetail': '卡片内容',
    'review.correct': '答对',
    'review.notQuite': '还差一点',
    'review.yourScore': '你的分数',
    'review.yourAnswer': '你的答案',
    'review.testMeNextTime': '下次再考我',
    'review.next': '下一题',
    'review.finalScore': '最终分数',
    'review.cardProgress': '第',
    'review.preparing': '正在准备复习...',
    'review.prepareFailedTitle': '无法开始测验',
    'review.prepareFailedBody': '测验准备没有完成，请再试一次。',
    'review.noCardsTitle': '没有可用卡片',
    'review.noCardsBody': '这个相册的卡片还不够建立测验。',
    'review.percentCorrect': '答对',
    'review.summaryOutstanding': '太强了，这些单词正在变成你的东西。',
    'review.summaryGoodEffort': '不错，再跑一轮会进步很快。',
    'review.summaryGreatJob': '做得好，你的记忆正在稳定下来。',
    'review.skippedPronunciation': '题发音题已跳过，会留到下次。',
    'review.playAgain': '再试一次',
    'review.done': '完成',
    'review.micPermissionRequired': '需要麦克风权限才能进行发音题。',
    'review.recordingMissing': '录音文件遗失，请重新录音。',
    'review.recordingTooShort': '录音太短，请清楚读出完整单词再提交。',
    'review.recordingInvalidFormat': '录音格式错误，请重新录音。',
    'review.assessFailed': '发音评分失败，请再试一次。',
    'review.recordFailed': '录音失败，请再试一次。',
    'pronunciation.coach': '发音教练',
    'pronunciation.listening': '聆听中',
    'pronunciation.secondsLeft': '秒剩余',
    'pronunciation.secondsMax': '秒上限',
    'pronunciation.preparingScore': '正在准备分数...',
    'pronunciation.analysisFailed': '分析失败',
    'pronunciation.tapMicRetry': '点下方麦克风再试一次。',
    'pronunciation.status.listeningWaveform': '正在听你的声波...',
    'pronunciation.status.mappingPhonemes': '正在对齐音素...',
    'pronunciation.status.comparingTiming': '正在比较母语节奏...',
    'pronunciation.status.scoring': '正在评分发音...',
    'pronunciation.pass': '通过',
    'pronunciation.fail': '未通过',
    'pronunciation.showAllSounds': '显示所有音素',
    'pronunciation.showFewerSounds': '收起音素',
    'pronunciation.ipaUnavailable': '这次没有取得正确的 IPA 音标。',
    'pronunciation.ipaLookupFailed': '无法取得 IPA 音标，请再试一次。',
    'pronunciation.reloadIpa': '重新取得 IPA 音标',
  },
};

export function normalizeUILanguage(value: unknown): UILanguage {
  if (
    value === 'zh-TW' ||
    value === 'zh-CN' ||
    value === 'en' ||
    value === 'ja' ||
    value === 'ko' ||
    value === 'es' ||
    value === 'fr'
  ) {
    return value;
  }
  return 'en';
}

export function getSupportedUILanguage(value: UILanguage): UILanguage {
  return normalizeUILanguage(value);
}

export function tUI(language: UILanguage, key: UIStringKey): string {
  const supported = getSupportedUILanguage(language);
  if (supported === 'en' || supported === 'zh-TW' || supported === 'zh-CN') {
    return STRINGS[supported][key] || STRINGS.en[key] || key;
  }
  return ADDITIONAL_UI_STRINGS[supported][key] || STRINGS.en[key] || key;
}
