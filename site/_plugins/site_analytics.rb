# frozen_string_literal: true

# Adds the self-hosted analytics tracker (../admin, a Cloudflare Worker) to every
# HTML page. Configure it under `site_analytics` in _config.yml. Lives here
# rather than in an include because al-folio's head is owned by al_folio_core.
module SiteAnalytics
  def self.tag(site)
    config = site.config["site_analytics"] || {}
    endpoint = config["endpoint"].to_s.strip.chomp("/")
    return if endpoint.empty?
    return if Jekyll.env != "production" && !config["track_in_development"]

    %(<script defer src="#{endpoint}/s.js" data-api="#{endpoint}"></script>)
  end
end

Jekyll::Hooks.register [:pages, :documents], :post_render do |doc|
  next unless doc.output_ext == ".html" && doc.output&.include?("</head>")

  tag = SiteAnalytics.tag(doc.site)
  doc.output = doc.output.sub("</head>", "#{tag}</head>") if tag
end
